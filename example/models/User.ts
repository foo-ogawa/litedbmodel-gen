import { DBModel, model, column, hasMany } from 'litedbmodel';
import { Post } from './Post.js';

@model('users')
class UserModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="users"*/
  @column.bigint({ primaryKey: true }) id?: bigint;
  @column.text() name?: string;
  @column.text() email?: string;
  @column.boolean() is_active?: boolean | null;
  @column.text() role?: string;
  @column.stringArray() tags?: string[] | null;
  @column.json<Record<string, unknown>>() metadata?: Record<string, unknown> | null;
  @column.datetime() created_at?: string;
  @column.datetime() updated_at?: string;
  /*@embedoc:end*/

  @hasMany(() => [User.id, Post.user_id])
  declare posts: Promise<Post[]>;
}

export const User = UserModel.asModel();
export type User = UserModel;
