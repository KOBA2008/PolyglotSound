/** Insère un caractère à la position du curseur et restaure la sélection après le rendu. */
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  char: string,
  current: string,
  apply: (next: string) => void,
) {
  const base = el ? el.value : current;
  const start = el?.selectionStart ?? base.length;
  const end = el?.selectionEnd ?? base.length;
  apply(base.slice(0, start) + char + base.slice(end));
  if (el) {
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + char.length;
      el.setSelectionRange(pos, pos);
    });
  }
}
