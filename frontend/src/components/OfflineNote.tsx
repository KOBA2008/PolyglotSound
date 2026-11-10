import { useOffline } from "../health";
import { IconAlert } from "./icons";

/** Mention discrète : action indisponible en mode démo hors ligne. */
export default function OfflineNote({ what = "Cette action" }: { what?: string }) {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p role="note" className="mt-3 flex items-center gap-2 text-sm text-gold-soft">
      <IconAlert size={15} className="shrink-0" />
      {what} nécessite le backend, indisponible en mode démo hors ligne (lecture seule).
    </p>
  );
}
