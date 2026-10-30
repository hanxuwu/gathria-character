import { useLayoutEffect, useRef, type RefObject } from "react";

/** Leave a retained editor's data mounted, but never leave an inactive modal
 * in the browser's top layer. Closing for suspension must not return focus to
 * a trigger in the now-hidden workspace. */
export function useRetainedDialog(
  dialog: RefObject<HTMLDialogElement | null>,
  active: boolean,
) {
  const activeRef = useRef(active);
  activeRef.current = active;

  useLayoutEffect(() => {
    const target = dialog.current;
    if (!active || !target) return;
    const returnFocus = document.activeElement;
    if (!target.open) target.showModal();
    return () => {
      const ownedFocus = target.contains(document.activeElement);
      if (target.open) target.close();
      if (
        activeRef.current &&
        ownedFocus &&
        returnFocus instanceof HTMLElement &&
        returnFocus.isConnected &&
        !returnFocus.closest("[hidden], [inert]") &&
        returnFocus.getClientRects().length
      )
        returnFocus.focus();
    };
  }, [active, dialog]);
}
