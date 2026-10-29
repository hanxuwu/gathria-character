import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SideCharacterId, SideCollection } from "../side-view/catalog";

const SideViewPlayground = lazy(
  () => import("../side-view/SideViewPlayground"),
);

export interface SideWorkspaceIdentity {
  character: SideCharacterId;
  collection: SideCollection;
}

type SlotKey = `${SideCharacterId}:${SideCollection}`;
const SLOT_KEYS: readonly SlotKey[] = [
  "male:material",
  "male:tailored",
  "female:material",
  "female:tailored",
];
const slotKey = (identity: SideWorkspaceIdentity): SlotKey =>
  `${identity.character}:${identity.collection}`;

interface SideSlot {
  key: SlotKey;
  initial: SideWorkspaceIdentity;
  loaded: SideWorkspaceIdentity;
}

/** Preserve each source/registration session, including its uncommitted fitting
 * draft. Loading a project updates its reported identity, never its React key.
 * Only a visited session is mounted; only the visible one receives input/time. */
export default function SideWorkspace({
  initialCharacter = "male",
  initialCollection = "material",
  active = true,
  onIdentityChange,
}: {
  initialCharacter?: SideCharacterId;
  initialCollection?: SideCollection;
  active?: boolean;
  onIdentityChange?: (identity: SideWorkspaceIdentity) => void;
}) {
  const [slots, setSlots] = useState<SideSlot[]>(() => {
    const identity = {
      character: initialCharacter,
      collection: initialCollection,
    };
    return [{ key: slotKey(identity), initial: identity, loaded: identity }];
  });
  const [selected, setSelected] = useState<SlotKey>(
    () => `${initialCharacter}:${initialCollection}`,
  );
  const [notice, setNotice] = useState("");
  const callbacks = useRef({ onIdentityChange });
  callbacks.current = { onIdentityChange };
  const current = slots.find((slot) => slot.key === selected)!;
  const duplicateIdentities =
    new Set(slots.map((slot) => slotKey(slot.loaded))).size < slots.length;

  useEffect(() => {
    if (active) callbacks.current.onIdentityChange?.(current.loaded);
  }, [active, current.loaded]);

  const identityChanged = useCallback(
    (key: SlotKey, identity: SideWorkspaceIdentity) => {
      setSlots((previous) =>
        previous.map((slot) =>
          slot.key !== key ||
          (slot.loaded.character === identity.character &&
            slot.loaded.collection === identity.collection)
            ? slot
            : { ...slot, loaded: identity },
        ),
      );
    },
    [],
  );

  function navigate(character: SideCharacterId, collection: SideCollection) {
    const identity = { character, collection };
    setNotice("");
    // Prefer an already open document of this identity, including cross-imports.
    // The slot key itself remains stable so drafts/undo are never remounted.
    const existing = slots.find(
      (slot) =>
        slot.loaded.character === character &&
        slot.loaded.collection === collection,
    );
    if (existing) {
      setSelected(existing.key);
      return;
    }
    // A cross-import can occupy the requested identity's usual slot. Use a free
    // stable slot rather than overwriting that imported draft or misreporting
    // it as the requested character. Duplicated imports count toward the bound.
    const preferred = slotKey(identity);
    const key = [preferred, ...SLOT_KEYS].find(
      (candidate) => !slots.some((slot) => slot.key === candidate),
    );
    if (!key) {
      setNotice(
        "当前已保留 4 个侧视项目。请先保存需要保留的项目，再刷新工作台打开另一组素材。",
      );
      return;
    }
    setSlots((previous) =>
      previous.some((slot) => slot.key === key)
        ? previous
        : [...previous, { key, initial: identity, loaded: identity }],
    );
    setSelected(key);
  }

  return (
    <div className="side-workspace" data-testid="side-workspace">
      {notice && <p role="status">{notice}</p>}
      {duplicateIdentities && (
        <div className="workbench-context">
          <label className="workbench-source">
            已打开的侧视项目
            <select
              data-testid="side-retained-project"
              value={selected}
              onChange={(event) => {
                const key = event.currentTarget.value as SlotKey;
                if (slots.some((slot) => slot.key === key)) {
                  setSelected(key);
                  setNotice("");
                }
              }}
            >
              {slots.map((slot, index) => (
                <option key={slot.key} value={slot.key}>
                  Kling {slot.loaded.character === "male" ? "男版" : "女版"}
                  {" · "}
                  {slot.loaded.collection === "tailored"
                    ? "新款试装"
                    : "原版型配色"}
                  {" · 项目 "}
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <p>同一角色已打开多个项目。分别保留搭配与草稿，可在这里切换查看。</p>
        </div>
      )}
      {slots.map((slot) => {
        const shown = active && slot.key === selected;
        return (
          <div
            key={slot.key}
            hidden={!shown}
            data-testid="side-session"
            data-session-key={slot.key}
            data-character={slot.loaded.character}
            data-collection={slot.loaded.collection}
            data-active={shown ? "true" : "false"}
          >
            <Suspense fallback={<p role="status">正在载入侧视动作与换装…</p>}>
              <SideViewPlayground
                initialCharacter={slot.initial.character}
                initialCollection={slot.initial.collection}
                active={shown}
                onNavigate={navigate}
                onIdentityChange={(identity) =>
                  identityChanged(slot.key, identity)
                }
              />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
