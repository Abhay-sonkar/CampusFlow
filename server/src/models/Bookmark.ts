import { Schema, Types, model } from 'mongoose';

export interface IBookmark {
  user: Types.ObjectId;
  opportunity: Types.ObjectId;
}

const bookmarkSchema = new Schema<IBookmark>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One bookmark per person per opportunity, enforced by the database
bookmarkSchema.index({ user: 1, opportunity: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 });

export const Bookmark = model<IBookmark>('Bookmark', bookmarkSchema);
