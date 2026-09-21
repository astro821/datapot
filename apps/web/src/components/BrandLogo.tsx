import brandSvg from '../assets/images/brand.svg';

type BrandLogoProps = {
  className?: string;
  /** Show "DATAPOT" text next to the mark */
  withWordmark?: boolean;
  size?: number;
};

export function BrandLogo({
  className = '',
  withWordmark = true,
  size = 32,
}: BrandLogoProps) {
  return (
    <span className={`dpot-logo ${className}`.trim()}>
      <img
        className="dpot-logo__mark"
        src={brandSvg}
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
      {withWordmark ? <span className="dpot-logo__word">DATAPOT</span> : null}
    </span>
  );
}
