import { DBModel, model, column } from 'litedbmodel';

@model('tags')
class TagModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="tags"*/
  @column.number({ primaryKey: true }) id?: number;
  @column.text() name?: string;
  @column.text() slug?: string;
  /*@embedoc:end*/
}

export const Tag = TagModel.asModel();
export type Tag = InstanceType<typeof Tag>;
