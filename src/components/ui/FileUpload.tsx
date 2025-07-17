'use client';

import { forwardRef, useState } from 'react';
import { Button } from './Button';
import { Text } from './Text';
import { Stack } from './Stack';
import { Image } from './Image';
import { upload } from '@vercel/blob/client';

interface FileUploadProps {
  value?: string;
  onChange?: (url: string) => void;
  onError?: (error: string) => void;
}

export const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(
  ({ value, onChange, onError }, ref) => {
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(value || null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        onError?.('Only PNG and JPEG files are allowed');
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        onError?.('File size must be less than 5MB');
        return;
      }

      setIsUploading(true);
      
      try {
        // Upload using client-side upload with presigned URL
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        });
        
        setPreview(blob.url);
        onChange?.(blob.url);
      } catch (error) {
        console.error('Upload error:', error);
        onError?.('Upload failed. Please try again.');
      } finally {
        setIsUploading(false);
      }
    };

    const handleRemove = () => {
      setPreview(null);
      onChange?.('');
      if (ref && 'current' in ref && ref.current) {
        ref.current.value = '';
      }
    };

    return (
      <Stack gap="sm">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="file-upload"
        />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button
            component="label"
            htmlFor="file-upload"
            variant="outline"
            size="sm"
            loading={isUploading}
            disabled={isUploading}
          >
            {preview ? 'Change Logo' : 'Upload Logo'}
          </Button>
          
          {preview && (
            <>
              <Image
                src={preview}
                alt="Logo preview"
                width={60}
                height={60}
                style={{
                  objectFit: 'contain',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                }}
              />
              <Button
                variant="subtle"
                size="sm"
                color="red"
                onClick={handleRemove}
              >
                Remove
              </Button>
            </>
          )}
        </div>
        
        <Text size="xs" c="dimmed">
          PNG or JPEG, max 5MB
        </Text>
      </Stack>
    );
  }
);

FileUpload.displayName = 'FileUpload'; 