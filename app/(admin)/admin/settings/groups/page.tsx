import { createClient } from '@/lib/supabase/server'
import GroupsClient from './GroupsClient'

export default async function GroupsPage() {
  const supabase = await createClient()

  const [{ data: groups }, { data: teams }] = await Promise.all([
    supabase.from('groups').select('id, name').order('name'),
    supabase.from('departments').select('id, name, group_id').order('name'),
  ])

  return <GroupsClient groups={groups ?? []} teams={teams ?? []} />
}
