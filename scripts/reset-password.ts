import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resetPassword() {
  const email = 'julianchauhan@gmail.com'
  const newPassword = 'SupremeSphere63'

  // Find the user
  const { data: users } = await supabase.auth.admin.listUsers()
  const user = users?.users?.find(u => u.email === email)

  if (!user) {
    console.log('❌ User not found')
    return
  }

  console.log(`Found user: ${user.email} (${user.id})`)
  console.log(`Email confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`)

  // Update password and confirm email
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
    email_confirm: true
  })

  if (error) {
    console.log('❌ Error:', error.message)
  } else {
    console.log('✅ Password reset and email confirmed!')
    console.log(`\n🔑 Login with:`)
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${newPassword}`)
  }
}

resetPassword()

