import { auth } from '@/lib/auth';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { trackError } from '@/lib/posthog';
import { logError, logInfo } from '@/lib/logger';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // auth
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Validate file extension
        const extension = pathname.split('.').pop()?.toLowerCase();
        if (!extension || !['png', 'jpg', 'jpeg'].includes(extension)) {
          throw new Error('Only PNG and JPEG files are allowed');
        }
        
        return {
          allowedContentTypes: ['image/png', 'image/jpeg'],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        logInfo('File upload completed', { 
          blob_url: blob.url,
          user_id: session?.user?.id,
          endpoint: '/api/upload'
        });
      },
    });

    logInfo('Upload request processed successfully', {
      user_id: session?.user?.id,
      endpoint: '/api/upload'
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const userId = session?.user?.id || 'anonymous';
    
    logError('File upload error', errorObj, { 
      endpoint: '/api/upload',
      user_id: userId 
    });
    trackError(userId, errorObj, { 
      endpoint: '/api/upload',
      operation: 'file_upload'
    });
    
    return NextResponse.json(
      { error: errorObj.message },
      { status: 400 }
    );
  }
} 