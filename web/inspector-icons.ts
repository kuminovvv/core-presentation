const paths: Record<string,string> = {
  free: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  row: '<rect x="3" y="7" width="6" height="10" rx="1"/><rect x="13" y="7" width="8" height="10" rx="1"/>',
  column: '<rect x="7" y="3" width="10" height="6" rx="1"/><rect x="7" y="13" width="10" height="8" rx="1"/>',
  gap: '<path d="M4 5v14M20 5v14M8 12h8m-6-2-2 2 2 2m4-4 2 2-2 2"/>',
  paddingX: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14"/>',
  paddingY: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 7h14M5 17h14"/>',
  left: '<path d="M4 3v18M8 7h12M8 16h8"/><rect x="8" y="5" width="12" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  right: '<path d="M20 3v18"/><rect x="4" y="5" width="12" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  centerX: '<path d="M12 3v18"/><rect x="4" y="5" width="16" height="4" rx="1"/><rect x="7" y="14" width="10" height="4" rx="1"/>',
  top: '<path d="M3 4h18"/><rect x="5" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  bottom: '<path d="M3 20h18"/><rect x="5" y="4" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  centerY: '<path d="M3 12h18"/><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="14" y="7" width="4" height="10" rx="1"/>',
  distribute: '<path d="M3 4v16M21 4v16"/><rect x="6" y="8" width="4" height="8" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  group: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 4l-4 16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  absolute: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="6" y="6" width="7" height="7" rx="1"/><path d="M17 13v6m-3-3h6"/>',
};
export function inspectorIcon(name: string): string {
  return '<svg class="inspector-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] ?? paths.more) + '</svg>';
}
