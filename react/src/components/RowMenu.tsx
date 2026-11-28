import React, { useState } from "react";

// Gate 7.5c: a register row's "⋯" menu (Edit / Clone / Delete), the markup Risks has used since
// the Redesign. Each item closes the menu first, then acts. Omit onClone where a register has none.
export function RowMenu({ onEdit, onClone, onDelete }: { onEdit: () => void; onClone?: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="card-menu">
      <button className="icon-btn" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open ? (
        <React.Fragment>
          <button className="card-menu__overlay" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="card-menu__dropdown">
            <button className="card-menu__item" onClick={act(onEdit)}>
              Edit
            </button>
            {onClone ? (
              <button className="card-menu__item" onClick={act(onClone)}>
                Clone
              </button>
            ) : null}
            <button className="card-menu__item" onClick={act(onDelete)}>
              Delete
            </button>
          </div>
        </React.Fragment>
      ) : null}
    </div>
  );
}
