import type { Presentation, SlideElement } from "./core/types";

const text = (id: string, text: string, x: number, y: number, width: number,
              height: number, fontSize: number, color = "#ffffff", fontWeight = 600): SlideElement => ({
  type: "text", id, text, x, y, width, height, fontSize, color, fontWeight,
  animation: { type: "slide-up", duration: 700, delay: 110 },
});
const shape = (id: string, x: number, y: number, width: number, height: number,
               fill: string, borderRadius = 20): SlideElement =>
  ({ type: "shape", id, x, y, width, height, fill, borderRadius });

export const demoPresentation: Presentation = {
  version: 1,
  id: "sample-deck",
  title: "The future is yours",
  viewport: { width: 1600, height: 900 },
  slides: [
    {
      id: "cover", name: "Обложка",
      background: "radial-gradient(ellipse at 84% 18%,#344b8b 0%,transparent 54%),linear-gradient(145deg,#121931,#0a1021)",
      transition: { type: "fade", duration: 550 },
      elements: [
        shape("cover-chip", 115, 170, 265, 50, "#28375b", 25),
        text("cover-kicker", "CORE / PRESENTATION", 132, 178, 350, 38, 24, "#9dbaff", 700),
        text("cover-title", "Ideas that\nmove people.", 115, 302, 1130, 280, 116, "#ffffff", 750),
        text("cover-subtitle", "Презентации как код. Создавайте без ограничений.", 122, 646, 1150, 70, 35, "#abb8d5", 400),
        shape("cover-line", 122, 772, 115, 8, "#8aa6ff", 4),
        shape("cover-orb", 1260, 490, 240, 240, "linear-gradient(135deg,#7b6eff,#3457b0)", 120),
      ],
    },
    {
      id: "features", name: "Возможности",
      background: "linear-gradient(130deg,#111a2b,#171d35)",
      transition: { type: "slide", duration: 650 },
      elements: [
        text("features-kicker", "01 / ВОЗМОЖНОСТИ", 112, 90, 1000, 50, 28, "#a9b7ff", 700),
        text("features-title", "Один движок.\nБесконечные идеи.", 110, 185, 1320, 210, 90),
        shape("f-card1", 112, 500, 412, 245, "#253453", 24),
        shape("f-card2", 554, 500, 412, 245, "#253453", 24),
        shape("f-card3", 996, 500, 412, 245, "#253453", 24),
        text("f-head1", "◈  Визуально", 148, 545, 345, 56, 43),
        text("f-body1", "Меняйте слайды в редакторе", 148, 642, 342, 65, 25, "#bfcae2", 400),
        text("f-head2", "⌘  Через код", 590, 545, 345, 56, 43),
        text("f-body2", "HTML, CSS, JavaScript", 590, 642, 342, 65, 25, "#bfcae2", 400),
        text("f-head3", "✦  С помощью ИИ", 1032, 545, 345, 56, 39),
        text("f-body3", "API для агентных сценариев", 1032, 642, 342, 65, 24, "#bfcae2", 400),
      ],
    },
    {
      id: "finish", name: "Результат",
      background: "radial-gradient(circle at 25% 100%,#343872,transparent 60%),#101525",
      transition: { type: "zoom", duration: 650 },
      elements: [
        text("finish-kicker", "02 / PRESENT ANYWHERE", 110, 138, 1200, 50, 27, "#a1acff", 700),
        text("finish-title", "Build once.\nPresent anywhere.", 110, 244, 1370, 295, 105),
        text("finish-subtitle", "Браузер · Локальный HTML · Open source", 118, 635, 1300, 80, 38, "#b5c2dc", 400),
        shape("finish-bar", 116, 758, 600, 9, "linear-gradient(90deg,#9581ff,#6aa9fa)", 5),
      ],
    },
  ],
};
