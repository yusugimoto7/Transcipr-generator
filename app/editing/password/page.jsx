"use client";

import { Shell } from "../ui";
import PasswordForm from "../PasswordForm";

export default function Page() {
  return <Shell>{(user) => <PasswordForm user={user} />}</Shell>;
}
