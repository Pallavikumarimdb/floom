import { getApp } from "@/lib/schemas";
import { AppRunner } from "@/components/app-runner";

type AppPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function AppPage({ params }: AppPageProps) {
  const { slug } = await params;
  const app = await getApp(slug);

  return <AppRunner app={app} />;
}
