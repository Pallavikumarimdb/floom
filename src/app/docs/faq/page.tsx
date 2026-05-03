import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about Floom apps — troubleshooting, JavaScript, privacy, file inputs.",
  alternates: { canonical: "https://floom.dev/docs/faq" },
};

const FAQS = [
  {
    id: "system-packages",
    q: "Why does my app fail with 'command not found'?",
    a: "The sandbox starts with a stock E2B image. If your app needs a system package (ffmpeg, pandoc, etc.), install it at the top of your run command: command: bash -c 'apt-get install -y ffmpeg -q && python app.py'.",
  },
  {
    id: "update-app",
    q: "How do I update an app?",
    a: "Run floom deploy again from the same directory. Floom creates a new bundle version. The slug stays the same; in-flight runs complete on the old bundle.",
  },
  {
    id: "delete-app",
    q: "How do I delete an app?",
    a: "DELETE /api/apps/:slug with an agent token that has publish scope. There is no CLI shortcut yet.",
  },
  {
    id: "javascript",
    q: "Can I run JavaScript or TypeScript?",
    a: "Yes. Add a package.json with a start script and Floom runs npm install && npm start. TypeScript needs a compile step; add it to the start script or use ts-node.",
  },
  {
    id: "private-apps",
    q: "Is my app code private?",
    a: "Apps with public: false are private. The bundle is stored with owner-only access. Public apps have their source viewable at /p/:slug.",
  },
  {
    id: "file-input",
    q: "Can I pass a file as input?",
    a: "Use x-floom-format: file on a string field in your input schema. The browser UI shows a file picker. The file is base64-encoded and sent as the field value.",
  },
  {
    id: "gemini-quota",
    q: "My Gemini key is hitting quota. What should I do?",
    a: "Add your own GEMINI_API_KEY as a secret and use it in your app. The free Gemini tier allows roughly 15 requests per minute; upgrade to a paid key for higher throughput.",
  },
];

export default function FaqPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Reference</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          FAQ
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Common questions about building and running Floom apps.
        </p>
      </div>

      <div className="mt-8 space-y-8">
        {FAQS.map(({ id, q, a }) => (
          <div key={id} id={id} className="scroll-mt-[88px]">
            <p className="font-semibold text-[#11110f]">{q}</p>
            <p className="mt-1 text-neutral-600">{a}</p>
          </div>
        ))}
      </div>
    </>
  );
}
