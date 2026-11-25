import type { HtmlElement, Presentation, Slide, SlideElement } from "../core/types";

function customDocument(element: HtmlElement): string {
  // The iframe has a unique opaque origin. This is not executed in the parent page.
  const css = (element.css ?? "").replace(/<\/style/gi, "<\\/style");
  const js = (element.javascript ?? "").replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${element.html}<script>${js}</script></body></html>`;
}

/** Constructs a real DOM node; text is inserted as textContent, not HTML. */
export function createElementNode(element: SlideElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "cp-element";
  wrapper.dataset.elementId = element.id;
  if (element.morphId) wrapper.dataset.morphId = element.morphId;
  Object.assign(wrapper.style, {
    position: "absolute",
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    opacity: String(element.opacity ?? 1),
    zIndex: String(element.zIndex ?? 0),
    boxSizing: "border-box",
  });
  switch (element.type) {
    case "text":
      wrapper.classList.add("cp-text");
      wrapper.textContent = element.text;
      Object.assign(wrapper.style, {
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontFamily: element.fontFamily ?? "Inter, system-ui, sans-serif",
        fontSize: `${element.fontSize ?? 56}px`,
        fontWeight: String(element.fontWeight ?? 500),
        fontStyle: element.fontStyle ?? "normal",
        color: element.color ?? "#ffffff",
        textAlign: element.align ?? "left",
        lineHeight: String(element.lineHeight ?? 1.2),
      });
      break;
    case "shape":
      Object.assign(wrapper.style, {
        background: element.fill ?? "#767cff",
        borderRadius: `${element.borderRadius ?? 0}px`,
        border: element.border ?? "none",
        boxShadow: element.boxShadow ?? "none",
      });
      break;
    case "image": {
      const image = document.createElement("img");
      if (element.src) image.src = element.src;
      image.alt = element.alt ?? "";
      image.loading = "lazy";
      Object.assign(image.style, {
        display: "block", width: "100%", height: "100%",
        objectFit: element.fit ?? "cover",
        borderRadius: `${element.borderRadius ?? 0}px`,
      });
      wrapper.append(image);
      break;
    }
    case "html": {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", "Custom slide content");
      frame.srcdoc = customDocument(element);
      frame.style.cssText = "display:block;width:100%;height:100%;border:0";
      wrapper.append(frame);
      break;
    }
  }
  return wrapper;
}

export function createSlideNode(slide: Slide, project: Presentation): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "cp-slide";
  layer.dataset.slideId = slide.id;
  Object.assign(layer.style, {
    width: `${project.viewport.width}px`,
    height: `${project.viewport.height}px`,
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    background: slide.background,
  });
  for (const element of slide.elements) layer.append(createElementNode(element));
  return layer;
}
