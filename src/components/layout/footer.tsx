export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-4 sm:px-6 py-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/35">
        <p>© {new Date().getFullYear()} Kawman ExAct Ingredients Pvt. Ltd. All rights reserved.</p>
        <p className="flex items-center gap-1.5">
          <span>Secure</span>
          <span aria-hidden="true">•</span>
          <span>Private</span>
          <span aria-hidden="true">•</span>
          <span>Company Confidential</span>
        </p>
      </div>
    </footer>
  )
}
