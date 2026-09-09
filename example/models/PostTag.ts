import { DBModel, model, column } from 'litedbmodel';

@model('post_tags')
class PostTagModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="post_tags"*/
  @column.bigint({ primaryKey: true }) post_id?: bigint;
  @column.bigint({ primaryKey: true }) tag_id?: bigint;
  @column.datetime() created_at?: string | null;
  /*@embedoc:end*/
}

export const PostTag = PostTagModel.asModel();
export type PostTag = InstanceType<typeof PostTag>;
