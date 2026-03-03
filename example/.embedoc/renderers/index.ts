import { litedbmodelColumns } from 'litedbmodel-gen';

export const embeds = {
  litedbmodel_columns: {
    ...litedbmodelColumns,
    dependsOn: ['schema'],
  },
};
