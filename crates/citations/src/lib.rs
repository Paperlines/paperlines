//! Citation graph over library items only: cached reference lists, matching, and edges.
pub mod citing;
pub mod edges;
pub mod fetch;
pub mod matcher;
pub mod refs;

pub use edges::{citations, CitationLink, Citations, RefStatus};
