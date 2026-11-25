import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { Presentation, SlideElement, Transition, SlideLayout } from "../core/types";
import {
  addElement, addSlide, createElement, createSlide, deleteElement, deleteSlide,
  duplicateSlide, groupElements, moveSlide, reorderElements, ungroupElements,
  updateElements,
} from "../core/document";
import { reorderLayoutAt } from "../core/auto-layout";
import { buildStandaloneHtml } from "../export/standalone.mjs";
import { buildPdf } from "../export/pdf.mjs";
import { renderSlide } from "./preview";
import { ProjectRepository } from "./project-repository";

const id = z.string().trim().min(1).max(180);
const projectName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/).optional();
const projectField = { project: projectName, expectedRevision: revision };
const position = z.number().finite().min(-100000).max(100000);
const dimension = z.number().finite().gt(0).max(20000);
const css = z.string().max(10000);
const duration = z.number().finite().min(0).max(10000);
const animation = z.strictObject({
  type: z.enum(["none", "fade", "slide-up", "zoom"]),
  duration: duration.optional(),
  delay: duration.optional(),
});
const transition = z.strictObject({
  type: z.enum(["none", "fade", "slide", "zoom", "morph"]),
  duration: duration.optional(),
});
const slideLayout = z.strictObject({
  direction: z.enum(["row", "column"]),
  wrap:z.boolean().optional(),gridColumns:z.number().int().min(1).max(50).optional(),
  crossGap:z.number().min(0).max(10000).optional(),
  paddingTop:z.number().min(0).max(10000).optional(),paddingRight:z.number().min(0).max(10000).optional(),paddingBottom:z.number().min(0).max(10000).optional(),paddingLeft:z.number().min(0).max(10000).optional(),
  packedJustify:z.enum(["start","center","end"]).optional(),
  gap: z.number().finite().min(0).max(10000),
  paddingX: z.number().finite().min(0).max(10000),
  paddingY: z.number().finite().min(0).max(10000),
  align: z.enum(["start", "center", "end"]),
  justify: z.enum(["start", "center", "end", "space-between"]),
});
const patchSchema = z.strictObject({
  layoutPosition: z.enum(["flow", "absolute"]).optional(),
  parentId: id.optional(),
  sizingX:z.enum(["fixed","hug","fill"]).optional(),sizingY:z.enum(["fixed","hug","fill"]).optional(),
  name:z.string().max(250).optional(),clipContent:z.boolean().optional(),layout:slideLayout.optional(),
  x: position.optional(), y: position.optional(),
  width: dimension.optional(), height: dimension.optional(),
  rotation: z.number().finite().min(-36000).max(36000).optional(),
  opacity: z.number().min(0).max(1).optional(),
  zIndex: z.number().int().min(-100000).max(100000).optional(),
  animation: animation.optional(),
  morphId: id.optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  boxShadow: css.optional(),
  text: z.string().max(200000).optional(),
  fontFamily: z.string().max(300).optional(),
  fontSize: z.number().finite().gt(0).max(5000).optional(),
  fontWeight: z.number().finite().min(100).max(1000).optional(),
  lineHeight: z.number().finite().gt(0).max(10).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  color: css.optional(),
  fill: css.optional(),
  border: css.optional(),
  borderRadius: z.number().finite().min(0).max(10000).optional(),
  src: z.string().max(200000).optional(),
  alt: z.string().max(2000).optional(),
  fit: z.enum(["cover", "contain", "fill"]).optional(),
  html: z.string().max(200000).optional(),
  css: z.string().max(100000).optional(),
  javascript: z.string().max(100000).optional(),
});
type Patch = z.infer<typeof patchSchema>;

const elementTypes: Record<SlideElement["type"], Set<string>> = {
  text: new Set(["text", "fontFamily", "fontSize", "fontWeight", "lineHeight", "align", "color", "fontStyle"]),
  shape: new Set(["fill", "border", "borderRadius", "boxShadow"]),
  frame: new Set(["name","fill","border","borderRadius","boxShadow","clipContent","layout"]),
  image: new Set(["src", "alt", "fit", "borderRadius"]),
  html: new Set(["html", "css", "javascript"]),
};
const universalProperties = new Set([
  "x", "y", "width", "height", "rotation", "opacity", "zIndex", "animation", "morphId", "layoutPosition", "parentId", "sizingX", "sizingY",
]);

function validatePatch(element: SlideElement, patch: Patch): void {
  for (const key of Object.keys(patch)) {
    if (!universalProperties.has(key) && !elementTypes[element.type].has(key)) {
      throw new Error(`Property '${key}' is not available for ${element.type} elements`);
    }
  }
}

function createTypedElement(type: SlideElement["type"], patch: Patch): SlideElement {
  const element = createElement(type);
  validatePatch(element, patch);
  Object.assign(element, patch);
  return element;
}

function afterEdit(record: { project: Presentation; revision: string }, details: Record<string, unknown> = {}) {
  return {
    projectId: record.project.id,
    title: record.project.title,
    revision: record.revision,
    slideCount: record.project.slides.length,
    ...details,
  };
}

function toolText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function editSlide(project: Presentation, slideId: string, patch: {
  name?: string; background?: string; transition?: Transition; notes?: string; layout?: SlideLayout;
}): Presentation {
  const copy = structuredClone(project);
  const slide = copy.slides.find(item => item.id === slideId);
  if (!slide) throw new Error(`Slide not found: ${slideId}`);
  Object.assign(slide, patch);
  return copy;
}

export function createMcpServer(repo: ProjectRepository): McpServer {
  const server = new McpServer({ name: "core-presentation", version: "1.3.0" });

  function add<T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: z.ZodObject<T>,
    operation: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>,
  ): void {
    server.registerTool(name, { description, inputSchema: schema }, async args => {
      try {
        return toolText(await operation(args));
      } catch (error) {
        return toolError(error);
      }
    });
  }

  add("presentation_list", "List all locally stored presentation projects and revision hashes.", z.object({}),
    async () => ({ projects: await repo.list() }));

  add("presentation_create",
    "Create an editable presentation project. Project names are simple folder slugs, not filesystem paths.",
    z.object({
      name: projectName,
      title: z.string().trim().min(1).max(300),
      width: z.number().int().min(320).max(2400).optional(),
      height: z.number().int().min(180).max(1600).optional(),
    }),
    async ({ name, title, width, height }) => {
      const record = await repo.create(name, title, {
        width: width ?? 1600, height: height ?? 900,
      });
      return afterEdit(record, { name, file: record.path });
    });

  add("presentation_duplicate_project",
    "Duplicate an existing project into a new independent presentation with another name.",
    z.object({ source: projectName, newName: projectName }),
    async ({ source, newName }) => {
      const record = await repo.duplicate(source, newName);
      return afterEdit(record, { name: newName, file: record.path });
    });

  add("presentation_archive_project",
    "Move a project into a recoverable .trash folder. Requires the latest expectedRevision to protect concurrent changes.",
    z.object({ project: projectName, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }),
    async ({ project, expectedRevision }) => {
      const result = await repo.archive(project, expectedRevision);
      return { name: result.name, archived: result.archived };
    });

  add("presentation_get",
    "Read presentation metadata and slides. Set includeElements to true to receive each element's full editable data.",
    z.object({ project: projectName, includeElements: z.boolean().optional() }),
    async ({ project, includeElements }) => {
      const record = await repo.read(project);
      return {
        name: project, revision: record.revision, id: record.project.id,
        title: record.project.title, viewport: record.project.viewport,
        slides: record.project.slides.map((slide, index) => ({
          ...slide,
          index,
          elements: includeElements ? slide.elements : slide.elements.map(element =>
            ({ id: element.id, type: element.type, x: element.x, y: element.y,
               width: element.width, height: element.height, groupId: element.groupId, parentId:element.parentId, layoutPosition: element.layoutPosition })),
        })),
      };
    });

  add("presentation_get_slide", "Read one slide with all elements, CSS, JavaScript and animations.",
    z.object({ project: projectName, slideId: id }),
    async ({ project, slideId }) => {
      const record = await repo.read(project);
      const slide = record.project.slides.find(item => item.id === slideId);
      if (!slide) throw new Error(`Slide not found: ${slideId}`);
      return { revision: record.revision, slide };
    });

  add("presentation_update",
    "Update presentation title or viewport without changing existing slide IDs.",
    z.object({ ...projectField,
      title: z.string().trim().min(1).max(300).optional(),
      width: z.number().int().min(320).max(2400).optional(),
      height: z.number().int().min(180).max(1600).optional(),
    }),
    async ({ project, expectedRevision, title, width, height }) => {
      const record = await repo.mutate(project, current => ({
        ...current, title: title ?? current.title,
        viewport: { width: width ?? current.viewport.width, height: height ?? current.viewport.height },
      }), expectedRevision);
      return afterEdit(record, { viewport: record.project.viewport });
    });

  add("presentation_add_slide", "Add a named slide with a CSS background and optional transition.",
    z.object({ ...projectField,
      name: z.string().trim().min(1).max(250),
      background: css.optional(),
      index: z.number().int().min(0).max(1000).optional(),
      transition: transition.optional(),
      notes: z.string().max(20000).optional(),
      layout: slideLayout.optional(),
    }),
    async ({ project, expectedRevision, name, background, index, transition: movement, notes, layout }) => {
      const slide = createSlide(name);
      if (background !== undefined) slide.background = background;
      if (movement !== undefined) slide.transition = movement;
      if (notes !== undefined) slide.notes = notes;
      if (layout !== undefined) slide.layout = layout;
      const record = await repo.mutate(project, p => addSlide(p, slide, index), expectedRevision);
      return afterEdit(record, { slideId: slide.id, name: slide.name });
    });

  add("presentation_update_slide", "Edit a slide's name, background or transition (none/fade/slide/zoom/morph) and speaker notes.",
    z.object({ ...projectField, slideId: id,
      name: z.string().trim().min(1).max(250).optional(),
      background: css.optional(),
      transition: transition.optional(),
      notes: z.string().max(20000).optional(),
      layout: slideLayout.nullable().optional(),
    }),
    async ({ project, expectedRevision, slideId, name, background, transition: movement, notes, layout }) => {
      const patch = { ...(name !== undefined && { name }),
        ...(background !== undefined && { background }),
        ...(movement !== undefined && { transition: movement }), ...(notes !== undefined && { notes }), ...(layout !== undefined && { layout: layout ?? undefined }) };
      const record = await repo.mutate(project, p => editSlide(p, slideId, patch), expectedRevision);
      return afterEdit(record, { slideId });
    });

  add("presentation_remove_slide", "Remove a slide by stable ID.",
    z.object({ ...projectField, slideId: id }),
    async ({ project, expectedRevision, slideId }) => {
      const record = await repo.mutate(project, p => deleteSlide(p, slideId), expectedRevision);
      return afterEdit(record, { removedSlideId: slideId });
    });

  add("presentation_duplicate_slide", "Duplicate a slide and its editable elements with new IDs.",
    z.object({ ...projectField, slideId: id }),
    async ({ project, expectedRevision, slideId }) => {
      const record = await repo.mutate(project, p => duplicateSlide(p, slideId), expectedRevision);
      const idx = record.project.slides.findIndex(item => item.id === slideId);
      return afterEdit(record, { slideId: record.project.slides[idx + 1]?.id });
    });

  add("presentation_move_slide", "Reorder a slide by specifying its new zero-based index.",
    z.object({ ...projectField, slideId: id, index: z.number().int().min(0).max(1000) }),
    async ({ project, expectedRevision, slideId, index }) => {
      const record = await repo.mutate(project, p => moveSlide(p, slideId, index), expectedRevision);
      return afterEdit(record, { slideId, index: record.project.slides.findIndex(s => s.id === slideId) });
    });

  add("presentation_add_element",
    "Add a text, shape, image or sandboxed HTML/CSS/JS element to a slide. Geometry is in slide pixels.",
    z.object({ ...projectField, slideId: id,
      type: z.enum(["text", "shape", "image", "html", "frame"]),
      properties: patchSchema,
    }),
    async ({ project, expectedRevision, slideId, type, properties }) => {
      const element = createTypedElement(type, properties);
      const record = await repo.mutate(project, p => addElement(p, slideId, element), expectedRevision);
      return afterEdit(record, { slideId, elementId: element.id, type });
    });

  add("presentation_update_elements",
    "Atomically update one or many elements (geometry, text, CSS properties, animation). Each patch uses an element ID. Does not change IDs or element types.",
    z.object({ ...projectField,
      changes: z.array(z.strictObject({ elementId: id, properties: patchSchema })).min(1).max(100),
    }),
    async ({ project, expectedRevision, changes }) => {
      const uniqueIds = new Set(changes.map(change => change.elementId));
      if (uniqueIds.size !== changes.length) throw new Error("Each element can only be updated once per batch");
      const record = await repo.mutate(project, p => {
        const patches: Record<string, Patch> = {};
        for (const change of changes) {
          const element = p.slides.flatMap(s => s.elements).find(e => e.id === change.elementId);
          if (!element) throw new Error(`Element not found: ${change.elementId}`);
          validatePatch(element, change.properties);
          patches[change.elementId] = change.properties;
        }
        return updateElements(p, patches);
      }, expectedRevision);
      return afterEdit(record, { editedElementIds: [...uniqueIds] });
    });

  add("presentation_remove_element", "Remove an element by ID.",
    z.object({ ...projectField, elementId: id }),
    async ({ project, expectedRevision, elementId }) => {
      const record = await repo.mutate(project, p => deleteElement(p, elementId), expectedRevision);
      return afterEdit(record, { removedElementId: elementId });
    });

  add("presentation_group", "Assign a stable group ID to at least two elements on the same slide.",
    z.object({ ...projectField, slideId: id, elementIds: z.array(id).min(2).max(100) }),
    async ({ project, expectedRevision, slideId, elementIds }) => {
      const record = await repo.mutate(project, p => groupElements(p, slideId, elementIds), expectedRevision);
      return afterEdit(record, { slideId, elementIds });
    });

  add("presentation_ungroup", "Remove grouping from the selected elements and their group members.",
    z.object({ ...projectField, slideId: id, elementIds: z.array(id).min(1).max(100) }),
    async ({ project, expectedRevision, slideId, elementIds }) => {
      const record = await repo.mutate(project, p => ungroupElements(p, slideId, elementIds), expectedRevision);
      return afterEdit(record, { slideId, elementIds });
    });

  add("presentation_layout_reorder", "Move auto-layout elements as units to a coordinate along the slide's layout axis.",
    z.object({ ...projectField, slideId: id, elementIds: z.array(id).min(1).max(100), coordinate: position }),
    async ({ project, expectedRevision, slideId, elementIds, coordinate }) => {
      const record = await repo.mutate(project, p => reorderLayoutAt(p, slideId, elementIds, coordinate), expectedRevision);
      return afterEdit(record, { slideId, elementIds });
    });

  add("presentation_layer", "Move selected elements to front or back of their slide.",
    z.object({ ...projectField, slideId: id, elementIds: z.array(id).min(1).max(100),
      direction: z.enum(["front", "back"]) }),
    async ({ project, expectedRevision, slideId, elementIds, direction }) => {
      const record = await repo.mutate(project,
        p => reorderElements(p, slideId, elementIds, direction), expectedRevision);
      return afterEdit(record, { slideId, elementIds, direction });
    });

  add("presentation_export_html",
    "Export a standalone, self-contained HTML player into the selected project's directory. Remote image URLs are not embedded.",
    z.object({ project: projectName }),
    async ({ project }) => {
      const record = await repo.read(project);
      const html = await buildStandaloneHtml(record.project);
      return { project, revision: record.revision,
        file: await repo.exportHtml(project, html), slides: record.project.slides.length };
    });

  add("presentation_export_pdf",
    "Export all slides to a printable multi-page PDF alongside the project. Requires Google Chrome.",
    z.object({ project: projectName }),
    async ({ project }) => {
      const record = await repo.read(project);
      const pdf = await buildPdf(record.project);
      const file = await repo.exportPdf(project, pdf);
      return { project, file, revision: record.revision, bytes: pdf.length, slides: record.project.slides.length };
    });

  server.registerTool("presentation_render_slide", {
    description: "Return a PNG screenshot of one slide (for visual inspection). Requires Google Chrome/CHROME_PATH. Network requests are disabled in the preview sandbox.",
    inputSchema: z.object({ project: projectName, slideId: id }),
  }, async ({ project, slideId }) => {
    try {
      const record = await repo.read(project);
      const image = await renderSlide(record.project, slideId);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({
            project, slideId, revision: record.revision, width: record.project.viewport.width,
            height: record.project.viewport.height,
          }) },
          { type: "image" as const, data: Buffer.from(image).toString("base64"), mimeType: "image/png" },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}
