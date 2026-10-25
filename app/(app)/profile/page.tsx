import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';

export default async function MyProfile() {
  const actor = await getActor();
  redirect(`/employees/${actor.id}`);
}
