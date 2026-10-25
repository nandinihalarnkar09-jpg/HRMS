import { getActor } from '@/lib/auth/actor';
import { AssistantChat, NotConfigured } from '@/components/assistant-chat';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Ask HR' };

export default async function Assistant() {
  const actor = await getActor();
  const configured = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GROQ_API_KEY);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Ask HR" subtitle="An assistant that checks the system for you. Every answer shows the tools it used." />
      {!configured && <NotConfigured />}
      <AssistantChat isManager={actor.isManager} isHr={actor.isHrAdmin} />
    </div>
  );
}
