import { DBModel, model, column, hasMany } from 'litedbmodel';
import { Post } from './Post.js';

@model('users')
class UserModel extends DBModel {
  /*@embedoc:litedbmodel_columns table="users"*/
  @column({ primaryKey: true }) id?: number;
  @column() name?: string;
  @column() email?: string;
  @column.boolean() is_active?: boolean | null;
  @column() role?: string;
  @column.stringArray() tags?: string[] | null;
  @column.json<Record<string, unknown>>() metadata?: Record<string, unknown> | null;
  @column.datetime() created_at?: Date;
  @column.datetime() updated_at?: Date;
  /*@embedoc:end*/

  @hasMany(() => [User.id, Post.user_id])
  declare posts: Promise<Post[]>;
}

export const User = UserModel.asModel();
export type User = UserModel;
