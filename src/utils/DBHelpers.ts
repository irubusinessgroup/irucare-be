/* eslint-disable @typescript-eslint/no-explicit-any */
export const QueryOptions = (
  columns: string[],
  searchq: string | undefined,
  associations: { as: string; columns: string[] }[] = [],
) => {
  const queryOptions: { [key: string]: any } = searchq
    ? {
        OR: [
          // Main model columns
          ...columns.map((column) => ({
            [column]: { contains: searchq, mode: "insensitive" },
          })),
          // Associated model columns using relations
          ...associations.flatMap(({ as, columns }) =>
            columns.map((column) => ({
              [as]: { [column]: { contains: searchq, mode: "insensitive" } },
            })),
          ),
        ].filter((condition) => {
          // Filter out unsupported conditions
          return Object.values(condition)[0]?.contains !== undefined;
        }),
      }
    : {};

  return queryOptions;
};

export const TimestampsNOrder = {
  select: { deletedAt: false, updatedAt: false },
  orderBy: { createdAt: "desc" },
};

export const Paginations = (
  currentPage: number | undefined,
  limit: number | undefined,
) => {
  const page = currentPage || 1;
  const pageSize = limit || 15;
  const skip = (page - 1) * pageSize;

  return { take: pageSize, skip };
};

export const DatesOpt = (
  startDate: string | undefined,
  endDate: string | undefined,
) => {
  let endDateStr = endDate;
  if (startDate && endDate && startDate === endDate) {
    endDateStr = undefined;
  }
  if (endDateStr) {
    const date = new Date(endDateStr);

    // Adding one day
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    // Formatting to yyyy-mm-dd
    endDateStr = nextDay.toISOString().split("T")[0];
  }

  return {
    AND: [
      startDate ? { createdAt: { gte: new Date(startDate) } } : {},
      endDateStr ? { createdAt: { lte: new Date(endDateStr) } } : {},
    ],
  };
};

export const generateCode = (prefix: string, length: number, affix: string) => {
  const str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += str[Math.floor(Math.random() * str.length)];
  }
  return `${code}${affix}`;
};
