import { useState } from 'react';

/** Shows the product photo, or a neutral box with the first letter if it is missing or broken. */
export function ProductImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="img-placeholder" aria-hidden>
        <span>{name.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}
