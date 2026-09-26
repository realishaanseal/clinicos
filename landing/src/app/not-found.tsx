import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main id="content" className="narrow doc">
      <div className="doc-panel">
        <h1>Page not found</h1>
        <p>
          Nothing on the site lives at this address. The link may be out of date, or there may be a
          typo in it.
        </p>
        <div className="cta-row" style={{ marginTop: "1.8rem" }}>
          <a className="btn btn-primary" href="/">Go to the home page</a>
        </div>
      </div>
    </main>
  );
}
