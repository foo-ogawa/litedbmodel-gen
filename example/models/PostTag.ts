import { DBModel, model, column } from 'litedbmodel';

@model('post_tags')
class PostTagModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="post_tags"*/
  @column.number({ primaryKey: true }) post_id?: number;
  @column.number({ primaryKey: true }) tag_id?: number;
  @column.datetime() created_at?: string | null;
  /*@embedoc:end*/
}

export const PostTag = PostTagModel.asModel();
export type PostTag = InstanceType<typeof PostTag>;
