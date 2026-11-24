export type ThemePreference = "system" | "light" | "dark";
const storageKey = "core-presentation:theme";
const system = window.matchMedia("(prefers-color-scheme: dark)");

export function initTheme(): void {
  const select = document.querySelector<HTMLSelectElement>("#theme-picker");
  if (!select) return;
  let preference: ThemePreference = "system";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark" || saved === "system") preference = saved;
  } catch { /* theme still works without storage */ }
  const apply = () => {
    const dark = preference === "dark" || (preference === "system" && system.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#191a1c" : "#f5f5f7");
    select.value = preference;
  };
  select.addEventListener("change", () => {
    preference = select.value === "dark" ? "dark" : select.value === "light" ? "light" : "system";
    try { localStorage.setItem(storageKey, preference); } catch { /* optional */ }
    apply();
  });
  system.addEventListener("change", apply);
  window.addEventListener("storage", event => {
    if (event.key !== storageKey) return;
    preference = event.newValue === "dark" || event.newValue === "light" ? event.newValue : "system";
    apply();
  });
  apply();
}
