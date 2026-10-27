export default function Modal({ title, size = 'lg', onClose, children, footer }) {
  return (
    <>
      <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
        <div className={`modal-dialog modal-${size} modal-dialog-centered modal-dialog-scrollable`}>
          <div className="modal-content" style={{ borderRadius: 14, border: 'none' }}>
            <div
              className="modal-header"
              style={{ background: 'linear-gradient(135deg, #1f2937, #000000)', color: '#fff', borderRadius: '14px 14px 0 0' }}
            >
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  )
}
