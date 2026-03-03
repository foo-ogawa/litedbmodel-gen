import { DBModel, model, column } from 'litedbmodel';

@model('tags')
class TagModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="tags"*/
  @column({ primaryKey: true }) id?: number;
  @column() name?: string;
  @column() slug?: string;
  /*@embedoc:end*/
}

export const Tag = TagModel.asModel();
export type Tag = InstanceType<typeof Tag>;
