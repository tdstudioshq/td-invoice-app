import Link from "next/link";

const services = [
  { number: "01", title: "Custom mylar printing", description: "Choose your bag style, quantity, and artwork. We’ll follow up with pricing and a proof.", href: "/mylar-printing", label: "Request a printing quote" },
  { number: "02", title: "Design & branding", description: "Packaging, logos, and artwork built around your brand. Send your ideas and references to get started.", href: "/custom-design-request", label: "Start a design request" },
  { number: "03", title: "Explore our work", description: "Browse packaging, branding, and custom design projects from TD Studios.", href: "/portfolio", label: "View the portfolio" },
];

export function HomeServices() {
  return (
    <section aria-labelledby="services-heading" className="relative border-t border-white/10 bg-[#101011] px-5 py-16 pb-28 sm:px-8 md:py-20">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-medium tracking-[0.2em] text-amber-200/80 uppercase">TD Studios · New York</p>
        <h2 id="services-heading" className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">From your idea to your packaging.</h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65">Design and print support in one place. Start with a printing quote, bring us a design brief, or take a look at our work.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {services.map((service) => (
            <article key={service.number} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <span aria-hidden="true" className="text-xs tracking-widest text-amber-200/65">{service.number}</span>
              <h3 className="mt-5 text-xl font-semibold text-white">{service.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-white/65">{service.description}</p>
              <Link href={service.href} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-amber-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200">{service.label}<span aria-hidden="true">↗</span></Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
