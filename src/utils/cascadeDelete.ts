import { Prisma } from "@prisma/client";

/**
 * Schema-driven cascade delete built from the Prisma DMMF, so newly added
 * tables are handled without maintaining a hand-written delete order.
 *
 * A row is "owned" by the root when it reaches the root through required
 * foreign keys. Optional foreign keys pointing at owned rows are set to null
 * (they may live in other tenants' data), then owned rows are deleted
 * children-first.
 */

type Where = Record<string, unknown>;

type RelationEdge = {
  child: string;
  parent: string;
  field: string;
  fkFields: string[];
  toFields: string[];
  required: boolean;
};

let cachedEdges: RelationEdge[] | null = null;

export function relationEdges(): RelationEdge[] {
  if (cachedEdges) return cachedEdges;
  const edges: RelationEdge[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const field of model.fields) {
      const fkFields = field.relationFromFields ?? [];
      if (field.kind !== "object" || fkFields.length === 0) continue;
      edges.push({
        child: model.name,
        parent: field.type,
        field: field.name,
        fkFields: [...fkFields],
        toFields: [...(field.relationToFields ?? [])],
        required: fkFields.every(
          (fk) => model.fields.find((f) => f.name === fk)?.isRequired,
        ),
      });
    }
  }
  cachedEdges = edges;
  return edges;
}

export const delegateName = (model: string) =>
  model.charAt(0).toLowerCase() + model.slice(1);

export type CascadePlan = {
  /** Filter selecting the owned rows of each model. */
  ownedWhere: Map<string, Where>;
  /** Optional FKs to null out before deleting. */
  nullify: { model: string; where: Where; data: Record<string, null> }[];
  /** Models in delete order (children before parents, root last). */
  deleteOrder: string[];
};

export function buildCascadePlan(
  rootModel: string,
  rootId: string,
  options: {
    stopAt?: string[];
    /** Models also owned through optional FKs (rows are meaningless without the parent). */
    followOptional?: string[];
  } = {},
): CascadePlan {
  const stopAt = new Set(options.stopAt ?? []);
  const followOptional = new Set(options.followOptional ?? []);
  const edges = relationEdges();

  const ownedWhere = new Map<string, Where>([[rootModel, { id: rootId }]]);
  const queue = [rootModel];

  // Tables that store e.g. `companyId` without declaring the relation.
  const scalarKey = `${delegateName(rootModel)}Id`;
  for (const model of Prisma.dmmf.datamodel.models) {
    const hasScalarKey = model.fields.some(
      (f) => f.kind === "scalar" && f.name === scalarKey,
    );
    const declared = edges.some(
      (e) => e.child === model.name && e.fkFields.includes(scalarKey),
    );
    if (hasScalarKey && !declared && !stopAt.has(model.name)) {
      ownedWhere.set(model.name, { [scalarKey]: rootId });
      queue.push(model.name);
    }
  }

  while (queue.length) {
    const parent = queue.shift()!;
    for (const e of edges) {
      if (
        e.parent !== parent ||
        !(e.required || followOptional.has(e.child)) ||
        ownedWhere.has(e.child) ||
        stopAt.has(e.child)
      ) {
        continue;
      }
      const directToRoot =
        parent === rootModel && e.fkFields.length === 1 && e.toFields[0] === "id";
      ownedWhere.set(
        e.child,
        directToRoot ? { [e.fkFields[0]]: rootId } : { [e.field]: ownedWhere.get(parent) },
      );
      queue.push(e.child);
    }
  }

  const nullify = edges
    .filter(
      (e) => !e.required && !followOptional.has(e.child) && ownedWhere.has(e.parent),
    )
    .map((e) => ({
      model: e.child,
      where: { [e.field]: ownedWhere.get(e.parent) },
      data: Object.fromEntries(e.fkFields.map((fk) => [fk, null])) as Record<string, null>,
    }));

  // Kahn's algorithm over the non-nulled edges between owned models.
  const owned = [...ownedWhere.keys()];
  const pendingChildren = new Map<string, number>(owned.map((m) => [m, 0]));
  const requiredOwned = edges.filter(
    (e) =>
      (e.required || followOptional.has(e.child)) &&
      e.child !== e.parent &&
      ownedWhere.has(e.child) &&
      ownedWhere.has(e.parent),
  );
  for (const e of requiredOwned) {
    pendingChildren.set(e.parent, pendingChildren.get(e.parent)! + 1);
  }
  const ready = owned.filter((m) => pendingChildren.get(m) === 0);
  const deleteOrder: string[] = [];
  while (ready.length) {
    const model = ready.shift()!;
    deleteOrder.push(model);
    for (const e of requiredOwned) {
      if (e.child !== model) continue;
      const left = pendingChildren.get(e.parent)! - 1;
      pendingChildren.set(e.parent, left);
      if (left === 0) ready.push(e.parent);
    }
  }
  if (deleteOrder.length !== owned.length) {
    const stuck = owned.filter((m) => !deleteOrder.includes(m));
    throw new Error(`Cannot order cascade delete; cycle between: ${stuck.join(", ")}`);
  }

  return { ownedWhere, nullify, deleteOrder };
}

export async function executeCascadePlan(
  tx: Prisma.TransactionClient,
  plan: CascadePlan,
): Promise<Record<string, number>> {
  const client = tx as unknown as Record<
    string,
    {
      updateMany: (args: { where: Where; data: Record<string, null> }) => Promise<{ count: number }>;
      deleteMany: (args: { where: Where }) => Promise<{ count: number }>;
    }
  >;

  for (const step of plan.nullify) {
    await client[delegateName(step.model)].updateMany({
      where: step.where,
      data: step.data,
    });
  }

  const deleted: Record<string, number> = {};
  for (const model of plan.deleteOrder) {
    const { count } = await client[delegateName(model)].deleteMany({
      where: plan.ownedWhere.get(model)!,
    });
    if (count) deleted[model] = count;
  }
  return deleted;
}
