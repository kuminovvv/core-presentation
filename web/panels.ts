/** Keep the canvas available, while allowing a user to hide or resize each side panel. */
export function initPanels(): void {
  const body = document.querySelector<HTMLElement>(".app-body");
  if (!body) return;
  const appBody = body;
  const prefix = "core-presentation:panel:";
  const bind = (side: "slides" | "inspector", min: number, max: number, defaultWidth: number) => {
    const panel = document.getElementById(side + "-panel")!;
    const toggle = document.getElementById("toggle-" + side)!;
    const handle = document.getElementById(side + "-resizer")!;
    let width = defaultWidth;
    let collapsed = false;
    try {
      const saved = localStorage.getItem(prefix + side);
      if (saved) {
        const state = JSON.parse(saved) as { width?: number; collapsed?: boolean; version?: number };
        if (typeof state.width === "number" && Number.isFinite(state.width) && (state.width !== (side === "slides" ? 216 : 280) || state.version === 2)) width = Math.max(min, Math.min(max, state.width));
        collapsed = state.collapsed === true;
      }
    } catch { /* optional */ }
    const apply = () => {
      panel.hidden = collapsed;
      appBody.classList.toggle(side + "-collapsed", collapsed);
      appBody.style.setProperty("--" + side + "-width", width + "px");
      toggle.setAttribute("aria-pressed", String(!collapsed));
      handle.setAttribute("aria-valuenow", String(width));
    };
    const save = () => {
      try { localStorage.setItem(prefix + side, JSON.stringify({ width, collapsed, version: 2 })); } catch { /* optional */ }
    };
    const resize = (next: number) => {
      width = Math.max(min, Math.min(max, Math.round(next)));
      apply();
    };
    toggle.addEventListener("click", () => { collapsed = !collapsed; apply(); save(); });
    let initial: { x: number; width: number } | null = null;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      initial = { x: event.clientX, width: panel.getBoundingClientRect().width };
      handle.setPointerCapture(event.pointerId);
      appBody.classList.add("resizing");
    });
    handle.addEventListener("pointermove", event => {
      if (initial) resize(initial.width + (event.clientX - initial.x) * (side === "slides" ? 1 : -1));
    });
    const end = () => { if (!initial) return; initial = null; appBody.classList.remove("resizing"); save(); };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
    handle.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      resize(width + (event.key === "ArrowRight" ? 1 : -1) * (side === "slides" ? 1 : -1) * 12);
      save();
    });
    apply();
  };
  bind("slides", 160, 420, 260);
  bind("inspector", 160, 420, 260);
}
