import { redirect } from 'next/navigation';

// /command moved to the owner-only /admin mission-control page. This redirect
// keeps existing deep links (and any bookmarks) working.
export default function CommandPage() {
  redirect('/admin');
}
