import { Schema, type SchemaOptions } from 'mongoose';

export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  minimize: false,
};

export const requiredTrimmedString = () => ({
  type: String,
  required: true,
  trim: true,
});

export const objectIdRef = (ref: string, required = true) => ({
  type: Schema.Types.ObjectId,
  ref,
  required,
});
