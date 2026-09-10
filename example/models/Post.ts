import { DBModel, model, column, belongsTo, hasMany } from 'litedbmodel';
import { User } from './User.js';
import { PostTag } from './PostTag.js';

@model('posts')
class PostModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="posts"*/
  @column.bigint({ primaryKey: true }) id?: bigint;
  @column.bigint() user_id?: bigint;
  @column.text() title?: string;
  @column.text() content?: string | null;
  @column.bigint() view_count?: bigint | null;
  @column.boolean() published?: boolean | null;
  @column.datetime() published_at?: string | null;
  @column.datetime() created_at?: string;
  @column.datetime() updated_at?: string;
  /*@embedoc:end*/

  @belongsTo(() => [Post.user_id, User.id])
  declare author: Promise<User | null>;

  @hasMany(() => [Post.id, PostTag.post_id])
  declare postTags: Promise<PostTag[]>;
}

export const Post = PostModel.asModel();
export type Post = PostModel;
