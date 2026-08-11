/*
  Why is the Publish button greyed out?

  Studio disables Publish for a short, known list of reasons. Two are already
  ruled out by scripts/publish-site-settings.mjs against the live data:

    - nothing to publish        no: the draft differs in two fields
    - validation errors         no: every url field is valid, and nothing else
                                    in siteSettings has an error-level rule
    - stale draft base          no: the draft's base rev matches published

  A release perspective is out too: a document open in a release would exist as
  `versions.<release>.siteSettings`, and the siteSettings query returned only
  the draft and the published document.

  That leaves PERMISSION, which I skipped early on the reasoning that Chris owns
  the project. That reasoning was weak. Sanity grants editing and publishing
  separately - a Contributor can create and edit drafts and cannot publish them
  - so "he saved a draft, therefore he can publish" does not follow. Saving is
  the evidence that he has the FIRST grant, and says nothing about the second.

  So this prints who is on the project and what each of them is allowed to do.

  WHAT IT CANNOT SEE

  This authenticates as the CI robot token, not as Chris's browser session. It
  can read the member list; it cannot confirm which account his Studio tab is
  logged in as. If the member list shows one human with a publishing role, the
  remaining question is whether that is the account he is actually using.

  Usage: SANITY_API_TOKEN=... node scripts/diagnose-publish-permission.mjs
*/
const PROJECT_ID = '8337vjtf'
const TOKEN = process.env.SANITY_API_TOKEN

if (!TOKEN) {
  console.error('SANITY_API_TOKEN is required.')
  process.exit(1)
}

/*
  Never throws. A management endpoint refusing a robot token is a real
  possibility and it is information, not a crash - the point is to find out
  what is readable, so one 403 must not take the rest of the output with it.
*/
const get = async (url) => {
  try {
    const res = await fetch(url, {headers: {Authorization: `Bearer ${TOKEN}`}})
    const text = await res.text()
    if (!res.ok) return {ok: false, status: res.status, body: text.slice(0, 300)}
    try {
      return {ok: true, data: JSON.parse(text)}
    } catch {
      return {ok: false, status: res.status, body: `not JSON: ${text.slice(0, 200)}`}
    }
  } catch (err) {
    return {ok: false, status: 0, body: String(err)}
  }
}

const MGMT = 'https://api.sanity.io/v2021-06-07'

console.log('# Who can publish on this project\n')

const project = await get(`${MGMT}/projects/${PROJECT_ID}`)
if (!project.ok) {
  console.log(`Could not read the project: ${project.status} ${project.body}\n`)
  console.log('That is usually the robot token lacking management-API scope. It')
  console.log('does not mean anything about Chris’s own permissions - it means')
  console.log('this check cannot answer the question and something else must.\n')
} else {
  const members = project.data.members ?? []
  console.log(`Project: ${project.data.displayName ?? PROJECT_ID}`)
  console.log(`${members.length} member(s).\n`)

  for (const m of members) {
    const roles = (m.roles ?? []).map((r) => r.name ?? r.title ?? '?')
    const label = roles.length ? roles.join(', ') : (m.role ?? 'unknown')
    /*
      Only administrator and editor publish. Contributor is the one that looks
      like full access right up until the moment you try - it can create and
      edit drafts, so everything feels normal while you type.
    */
    const canPublish = roles.some((r) => r === 'administrator' || r === 'editor')
    console.log(`  ${m.isRobot ? '[robot] ' : ''}${m.id}`)
    console.log(`      role(s)     ${label}`)
    if (!m.isRobot) {
      console.log(
        `      publish?    ${canPublish ? 'yes' : 'NO - this account can edit drafts but not publish them'}`,
      )
    }

    // Names are not on the member record; resolve separately, best effort.
    if (!m.isRobot) {
      const user = await get(`${MGMT}/users/${m.id}`)
      if (user.ok) {
        console.log(
          `      who         ${user.data.displayName ?? '(no name)'} ${user.data.email ? `<${user.data.email}>` : ''}`,
        )
      }
    }
    console.log()
  }

  const humans = members.filter((m) => !m.isRobot)
  const publishers = humans.filter((m) =>
    (m.roles ?? []).some((r) => (r.name ?? '') === 'administrator' || (r.name ?? '') === 'editor'),
  )

  console.log('## Verdict\n')
  if (!publishers.length && humans.length) {
    console.log('  No human account on this project holds a publishing role. That is')
    console.log('  the answer: the button is grey because the account cannot publish,')
    console.log('  and no amount of clicking it will change that. Fix it in')
    console.log(`  sanity.io/manage/project/${PROJECT_ID}/members by setting the role`)
    console.log('  to Administrator.')
  } else if (publishers.length === humans.length) {
    console.log('  Every human account here can publish, so a missing grant is NOT')
    console.log('  the explanation - provided Chris’s Studio tab is logged in as one')
    console.log('  of the accounts above. Worth confirming: Studio shows the signed-in')
    console.log('  account under the avatar at the top right.')
  } else {
    console.log('  Mixed. Some accounts can publish and some cannot, so which one the')
    console.log('  Studio tab is signed in as decides whether the button works.')
  }
}

/*
  Whatever the roles turn out to be, the disabled button states its own reason
  on hover, and that beats every inference in this file.
*/
console.log()
console.log('## The check that outranks all of this\n')
console.log('  Hover the greyed-out Publish button. Studio puts the reason in the')
console.log('  tooltip - "You do not have permission to publish this document",')
console.log('  "There are validation errors", "No changes to publish". That is the')
console.log('  answer from the code that actually disabled it, rather than from me')
console.log('  reasoning about it from the outside.')
