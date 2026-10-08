export default function DevFooter({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://wa.me/6285257796187"
      target="_blank"
      rel="noopener noreferrer"
      className={`block text-[11px] text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline transition-colors ${className}`}
    >
      Developed by @jeweller85
    </a>
  );
}
