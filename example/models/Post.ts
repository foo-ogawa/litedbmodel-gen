import { DBModel, model, column, belongsTo, hasMany } from 'litedbmodel';
import { User } from './User.js';
import { PostTag } from './PostTag.js';

@model('posts')
class PostModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="posts"*/
  @column({ primaryKey: true }) id?: number;
  @column() user_id?: number;
  @column() title?: string;
  @column() content?: string | null;
  @column() view_count?: number | null;
  @column.boolean() published?: boolean | null;
  @column.datetime() published_at?: Date | null;
  @column.datetime() created_at?: Date;
  @column.datetime() updated_at?: Date;
  /*@embedoc:end*/

  @belongsTo(() => [Post.user_id, User.id])
  declare author: Promise<User | null>;

  @hasMany(() => [Post.id, PostTag.post_id])
  declare postTags: Promise<PostTag[]>;
}

export const Post = PostModel.asModel();
export type Post = PostModel;
