import Modal from './Modal'

/**
 * Shows a newly issued username + temporary password exactly once.
 * credentials: { title, intro, username, password, emailSent }
 */
export default function CredentialsModal({ credentials, onClose }) {
  const copy = () => {
    const signIn = credentials.login_url ? `Sign in at: ${credentials.login_url}\n` : ''
    navigator.clipboard?.writeText(`${signIn}Username: ${credentials.username}\nPassword: ${credentials.password}`)
  }

  return (
    <Modal
      title={credentials.title || 'Login credentials'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline-primary" onClick={copy}>Copy credentials</button>
          <button className="btn btn-success" onClick={onClose}>Done</button>
        </>
      )}
    >
      {credentials.intro && <p>{credentials.intro}</p>}
      <table className="table table-sm mb-3">
        <tbody>
          {credentials.login_url && (
            <tr>
              <th style={{ width: 160 }}>Sign-in page</th>
              <td><a href={credentials.login_url} target="_blank" rel="noreferrer">{credentials.login_url}</a></td>
            </tr>
          )}
          <tr><th style={{ width: 160 }}>Username</th><td><code>{credentials.username}</code></td></tr>
          <tr><th>Temporary password</th><td><code>{credentials.password}</code></td></tr>
        </tbody>
      </table>
      <div className={`alert ${credentials.emailSent ? 'alert-success' : 'alert-warning'} mb-2`}>
        {credentials.emailSent
          ? `These credentials were also emailed to ${credentials.username}.`
          : 'The email could not be sent — share these credentials yourself.'}
      </div>
      <p className="text-muted small mb-0">
        This password is shown only once. At sign-in they must set a new password, confirmed with a code sent to their email.
      </p>
    </Modal>
  )
}
