import { google } from 'googleapis'
import { Readable } from 'stream'

function getDriveClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    subject: process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
  })
  return google.drive({ version: 'v3', auth })
}

export async function uploadPDF(
  pdfBytes: Uint8Array,
  fileName: string,
  folderId?: string,
): Promise<string | null> {
  const drive = getDriveClient()

  const stream = Readable.from(Buffer.from(pdfBytes))

  const { data } = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/pdf',
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType: 'application/pdf',
      body: stream,
    },
  })

  return data.id ?? null
}

export async function getFileUrl(fileId: string): Promise<string> {
  return `https://drive.google.com/file/d/${fileId}/view`
}
