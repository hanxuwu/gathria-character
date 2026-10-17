import type { ActionForearms, ForearmAction } from "./types";

/** A deliberately narrow opt-in contract: paired whole-forearm alternatives
 * for active actions, registered to the existing arm chains. No slot aliases,
 * arbitrary animation names or partial left/right pairs are accepted. */
export function validateActionForearms(value: unknown): ActionForearms {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("actionForearms must map run and/or jump to paired forearms.");
  const raw = value as Record<string, unknown>;
  const actions = Object.keys(raw);
  if (
    actions.length === 0 ||
    actions.length > 2 ||
    actions.some((name) => name !== "run" && name !== "jump")
  )
    throw Error("actionForearms must contain run and/or jump only.");
  const result: ActionForearms = {};
  for (const action of ["run", "jump"] as const satisfies ForearmAction[]) {
    if (!Object.hasOwn(raw, action)) continue;
    const pair = raw[action];
    if (!pair || typeof pair !== "object" || Array.isArray(pair))
      throw Error(`actionForearms.${action} needs both active forearms.`);
    const slots = pair as Record<string, unknown>;
    if (
      Object.keys(slots).length !== 2 ||
      slots["near-forearm"] !== "near-forearm-active" ||
      slots["far-forearm"] !== "far-forearm-active"
    )
      throw Error(
        `actionForearms.${action} needs both matching active forearms.`,
      );
    result[action] = {
      "near-forearm": "near-forearm-active",
      "far-forearm": "far-forearm-active",
    };
  }
  return result;
}
