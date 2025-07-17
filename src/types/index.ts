import { z } from 'zod';

// Better Auth User type (matches their structure)
export const UserSchema = z.object({
    _id: z.string(),
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    image: z.string().url().optional(),
    emailVerified: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // Our custom field for onboarding
    hasCompletedOnboarding: z.boolean().optional(),
});

export const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateUserSchema = UserSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

// Account Configuration Schemas (simplified for boilerplate)
export const AccountConfigSchema = z.object({
    _id: z.string(),
    userId: z.string(),
    companyName: z.string().min(1, 'Company name is required'),
    websiteUrl: z.string().url('Please provide a valid website URL').optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const CreateAccountConfigSchema = AccountConfigSchema.omit({ _id: true, createdAt: true, updatedAt: true });
export const UpdateAccountConfigSchema = AccountConfigSchema.partial().omit({ _id: true, userId: true, createdAt: true, updatedAt: true });

// Onboarding Schemas (simplified for boilerplate)
export const AccountConfigFormDataSchema = z.object({
    companyName: z.string().min(1, 'Company name is required'),
    websiteUrl: z.string().url('Please provide a valid website URL').optional(),
});

// Example task schemas for boilerplate
export const ExampleTaskTypeSchema = z.enum(['example']);

export const ExampleTaskInputSchema = z.object({
    userId: z.string(),
    taskId: z.string(),
    type: ExampleTaskTypeSchema,
});

// Inferred Types

// User
export type User = z.infer<typeof UserSchema>;

// Account Config
export type AccountConfig = z.infer<typeof AccountConfigSchema>;
export type AccountConfigFormData = z.infer<typeof AccountConfigFormDataSchema>;
export type CreateAccountConfigInput = z.infer<typeof CreateAccountConfigSchema>;
export type UpdateAccountConfigInput = z.infer<typeof UpdateAccountConfigSchema>;

// Example Task (for boilerplate)
export type ExampleTaskType = (typeof ExampleTaskTypeSchema)['Enum'];
export type ExampleTaskInput = z.infer<typeof ExampleTaskInputSchema>;

// Server Action Result Type
export interface ServerActionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string[]>;
} 