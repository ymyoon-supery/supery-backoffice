import { google } from 'googleapis'
import { JWT } from 'google-auth-library'

function getCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.calendar({ version: 'v3', auth })
}

function getServiceCalendarClient(subjectEmail: string) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set')
  const creds = JSON.parse(raw) as { client_email: string; private_key: string }
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: subjectEmail,
  })
  return google.calendar({ version: 'v3', auth })
}

export async function insertEvent(
  accessToken: string,
  event: {
    summary: string
    startDate: string
    endDate: string
    description?: string
    attendeeEmail?: string
  },
): Promise<string | null> {
  const calendar = getCalendarClient(accessToken)

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { date: event.startDate },
      end: { date: event.endDate },
      attendees: event.attendeeEmail
        ? [{ email: event.attendeeEmail }]
        : undefined,
    },
  })

  return data.id ?? null
}

export async function deleteEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  const calendar = getCalendarClient(accessToken)
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  })
}

export async function insertEventForEmployee(
  subjectEmail: string,
  event: {
    summary: string
    startDate: string
    endDate: string
    description?: string
  },
): Promise<string | null> {
  const calendar = getServiceCalendarClient(subjectEmail)
  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { date: event.startDate },
      end: { date: event.endDate },
    },
  })
  return data.id ?? null
}
