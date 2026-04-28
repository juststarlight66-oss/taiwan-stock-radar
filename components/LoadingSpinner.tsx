export default function LoadingSpinner({ text = '載入中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-500">
      <svg className="animate-spin w-5 h-5 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="text-sm">{text}</span>
    </div>
  );
}
