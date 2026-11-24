import type { Presentation, Slide, TextElement, ShapeElement } from "../core/types";
import { createElement, createSlide } from "../core/document";

export type SlideLayout = "blank" | "title" | "section" | "two-columns" | "quote";
const names: Record<SlideLayout, string> = {
  blank: "Пустой слайд",
  title: "Титульный слайд",
  section: "Раздел",
  "two-columns": "Две колонки",
  quote: "Цитата",
};

function text(value: string, x: number, y: number, w: number, h: number, size: number,
              color = "#ffffff", weight = 600): TextElement {
  return { ...(createElement("text") as TextElement),
    text: value, x, y, width: w, height: h,
    fontSize: size, color, fontWeight: weight,
    animation: { type: "slide-up", duration: 550 },
  };
}
function shape(x: number, y: number, w: number, h: number, fill: string, radius = 14): ShapeElement {
  return { ...(createElement("shape") as ShapeElement), x, y, width: w, height: h,
    fill, borderRadius: radius };
}
/** Editable native objects, not flattened image templates. */
export function createLayoutSlide(layout: SlideLayout, viewport: Presentation["viewport"]): Slide {
  const slide = createSlide(names[layout]);
  const { width: w, height: h } = viewport;
  const sx = w / 1600, sy = h / 900;
  const p = (x: number, y: number, ww: number, hh: number) =>
    [x * sx, y * sy, ww * sx, hh * sy] as const;
  const t = (value: string, x: number, y: number, ww: number, hh: number, size: number, color?: string, weight?: number) => {
    const [a, b, c, d] = p(x, y, ww, hh);
    slide.elements.push(text(value, a, b, c, d, size * sy, color, weight));
  };
  const s = (x: number, y: number, ww: number, hh: number, fill: string, radius?: number) => {
    const [a, b, c, d] = p(x, y, ww, hh);
    slide.elements.push(shape(a, b, c, d, fill, (radius ?? 14) * sy));
  };
  if (layout === "blank") return slide;
  if (layout === "title") {
    slide.background = "radial-gradient(ellipse at 85% 20%,#384995,transparent 62%),#10172b";
    s(120, 150, 205, 8, "#8ea4ff", 4);
    t("Заголовок презентации", 120, 270, 1350, 230, 106);
    t("Подзаголовок · Имя автора · 2026", 128, 590, 1120, 80, 35, "#aebdd7", 400);
  } else if (layout === "section") {
    slide.background = "linear-gradient(125deg,#11172b,#252f62)";
    t("01 / РАЗДЕЛ", 118, 120, 1000, 60, 28, "#9bb3ff", 700);
    t("Название раздела", 112, 330, 1310, 165, 104);
    s(114, 565, 420, 8, "#91a9ff", 4);
  } else if (layout === "two-columns") {
    slide.background = "#111827";
    t("Сравнение двух подходов", 112, 90, 1250, 100, 74);
    s(110, 275, 660, 495, "#253451", 25);
    s(825, 275, 660, 495, "#253451", 25);
    t("Первый подход", 152, 330, 580, 90, 51);
    t("Опишите основные преимущества и ключевые идеи первого варианта.", 152, 465, 570, 205, 33, "#c4d0e6", 400);
    t("Второй подход", 875, 330, 570, 90, 51);
    t("Опишите отличия, преимущества и результаты второго варианта.", 875, 465, 570, 205, 33, "#c4d0e6", 400);
  } else if (layout === "quote") {
    slide.background = "linear-gradient(145deg,#15213d,#121727)";
    t("“", 112, 125, 300, 175, 160, "#839bff", 800);
    t("Сильная мысль, которую аудитория запомнит.", 180, 280, 1200, 330, 77);
    t("— Автор цитаты", 185, 695, 850, 75, 31, "#a9b8d7", 400);
  } else {
    throw new Error("Unknown slide layout: " + layout);
  }
  return slide;
}
