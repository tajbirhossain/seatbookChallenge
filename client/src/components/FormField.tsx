import { ReactNode } from 'react';

type Props = {
  label: string;
  htmlFor: string;
  // Shown beside the label: "(Required)" in red, "(Optional)" in grey.
  badge?: 'required' | 'optional';
  // Short help text under the field. Turns red when `invalid` is set.
  hint?: string;
  invalid?: boolean;
  // Shows how many characters are left. Turns amber when nearly full and red when over.
  limit?: { used: number; max: number };
  children: ReactNode;
};

export default function FormField({ label, htmlFor, badge, hint, invalid, limit, children }: Props) {
  const left = limit ? limit.max - limit.used : 0;
  const counterColor =
    left < 0 ? 'text-[#fca5a5]' : limit && left <= limit.max * 0.1 ? 'text-[#fcd34d]' : 'text-white/40';

  return (
    <div>
      <label htmlFor={htmlFor} className="block mb-2 text-sm font-medium text-white/70">
        {label}
        {badge && (
          <span className={`ml-1.5 text-[11px] font-normal ${badge === 'required' ? 'text-[#fca5a5]' : 'text-white/40'}`}>
            ({badge === 'required' ? 'Required' : 'Optional'})
          </span>
        )}
      </label>
      {children}
      {(hint || limit) && (
        <div className="mt-2 flex justify-between gap-3 text-xs">
          <span className={invalid ? 'text-[#fca5a5]' : 'text-white/40'}>{hint}</span>
          {limit && (
            <span className={`shrink-0 tabular-nums ${counterColor}`}>
              {left >= 0 ? `${left} left` : `${-left} over`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
