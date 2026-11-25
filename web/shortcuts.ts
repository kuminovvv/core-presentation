export function shortcutKey(e:Pick<KeyboardEvent,"code"|"key">):string{
  return /^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():e.key.toLowerCase();
}
