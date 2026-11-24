//! "Export annotated PDF": writes a copy of the PDF with highlights as standard PDF annotations.
//! The stored original is never modified.
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Annotation {
    /// 1-based page.
    pub page: u32,
    /// highlight | underline | rect
    pub kind: String,
    /// Normalized to the displayed page: (x, y, w, h), origin top-left.
    pub rects: Vec<(f64, f64, f64, f64)>,
    pub rgb: (f32, f32, f32),
    pub contents: Option<String>,
}

pub fn color_rgb(name: &str) -> (f32, f32, f32) {
    match name {
        "red" => (0.98, 0.45, 0.45),
        "green" => (0.45, 0.85, 0.5),
        "blue" => (0.45, 0.65, 0.98),
        "purple" => (0.75, 0.55, 0.95),
        "orange" => (1.0, 0.65, 0.3),
        "pink" => (1.0, 0.6, 0.8),
        "teal" => (0.35, 0.82, 0.78),
        "lime" => (0.72, 0.9, 0.35),
        "brown" => (0.78, 0.62, 0.45),
        "gray" => (0.72, 0.74, 0.78),
        _ => (1.0, 0.9, 0.3),
    }
}

/// Looks up an inheritable page attribute (MediaBox, Rotate) walking up the page tree.
fn inherited<'a>(doc: &'a Document, mut dict: &'a Dictionary, key: &[u8]) -> Option<&'a Object> {
    for _ in 0..32 {
        if let Ok(v) = dict.get(key) {
            return Some(v);
        }
        let parent = dict.get(b"Parent").ok()?.as_reference().ok()?;
        dict = doc.get_dictionary(parent).ok()?;
    }
    None
}

fn num(doc: &Document, o: &Object) -> Option<f64> {
    let o = match o {
        Object::Reference(r) => doc.get_object(*r).ok()?,
        o => o,
    };
    match o {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(r) => Some(*r as f64),
        _ => None,
    }
}

/// Maps a normalized point on the displayed (rotated) page to PDF user space.
fn to_pdf(u: f64, v: f64, rotate: i64, mb: [f64; 4]) -> (f64, f64) {
    let (s, t) = match rotate.rem_euclid(360) {
        90 => (v, 1.0 - u),
        180 => (1.0 - u, 1.0 - v),
        270 => (1.0 - v, u),
        _ => (u, v),
    };
    (mb[0] + s * (mb[2] - mb[0]), mb[3] - t * (mb[3] - mb[1]))
}

pub fn page_geometry(doc: &Document, page: ObjectId) -> Result<([f64; 4], i64), String> {
    let dict = doc.get_dictionary(page).map_err(|e| e.to_string())?;
    let mb = inherited(doc, dict, b"MediaBox")
        .and_then(|o| match o {
            Object::Reference(r) => doc.get_object(*r).ok(),
            o => Some(o),
        })
        .and_then(|o| o.as_array().ok())
        .and_then(|a| {
            let v: Vec<f64> = a.iter().filter_map(|x| num(doc, x)).collect();
            (v.len() == 4).then(|| [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])])
        })
        .unwrap_or([0.0, 0.0, 612.0, 792.0]);
    let rotate = inherited(doc, dict, b"Rotate").and_then(|o| num(doc, o)).unwrap_or(0.0) as i64;
    Ok((mb, rotate))
}

fn annotation_dict(a: &Annotation, mb: [f64; 4], rotate: i64) -> Dictionary {
    let mut quads: Vec<Object> = Vec::new();
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for &(x, y, w, h) in &a.rects {
        let corners = [
            to_pdf(x, y, rotate, mb),
            to_pdf(x + w, y, rotate, mb),
            to_pdf(x, y + h, rotate, mb),
            to_pdf(x + w, y + h, rotate, mb),
        ];
        let lx = corners.iter().map(|c| c.0).fold(f64::MAX, f64::min);
        let hx = corners.iter().map(|c| c.0).fold(f64::MIN, f64::max);
        let ly = corners.iter().map(|c| c.1).fold(f64::MAX, f64::min);
        let hy = corners.iter().map(|c| c.1).fold(f64::MIN, f64::max);
        // QuadPoints order: upper-left, upper-right, lower-left, lower-right
        for v in [lx, hy, hx, hy, lx, ly, hx, ly] {
            quads.push(Object::Real(v as f32));
        }
        (x0, y0, x1, y1) = (x0.min(lx), y0.min(ly), x1.max(hx), y1.max(hy));
    }
    let subtype = match a.kind.as_str() {
        "underline" => "Underline",
        "rect" => "Square",
        _ => "Highlight",
    };
    let mut d = dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => vec![Object::Real(x0 as f32), Object::Real(y0 as f32), Object::Real(x1 as f32), Object::Real(y1 as f32)],
        "C" => vec![Object::Real(a.rgb.0), Object::Real(a.rgb.1), Object::Real(a.rgb.2)],
        "F" => 4,
    };
    if subtype == "Square" {
        d.set("BS", dictionary! { "W" => 2 });
    } else {
        d.set("QuadPoints", quads);
    }
    if subtype == "Highlight" {
        d.set("CA", Object::Real(0.45));
    }
    if let Some(c) = &a.contents {
        d.set("Contents", Object::string_literal(c.as_bytes().to_vec()));
    }
    d
}

/// MediaBox and rotation of every page (1-based), for converting PDF coordinates.
pub fn page_boxes(path: &Path) -> Result<std::collections::HashMap<u32, ([f64; 4], i64)>, String> {
    let doc = Document::load(path).map_err(|e| format!("Could not read PDF: {e}"))?;
    let mut out = std::collections::HashMap::new();
    for (n, id) in doc.get_pages() {
        out.insert(n, page_geometry(&doc, id)?);
    }
    Ok(out)
}

/// Inverse of the export mapping: a rect in PDF user space to a rect normalized to the displayed page.
pub fn from_pdf_rect(r: [f64; 4], mb: [f64; 4], rotate: i64) -> (f64, f64, f64, f64) {
    let (w, h) = (mb[2] - mb[0], mb[3] - mb[1]);
    let corner = |x: f64, y: f64| {
        let (s, t) = ((x - mb[0]) / w, (mb[3] - y) / h);
        match rotate.rem_euclid(360) {
            90 => (1.0 - t, s),
            180 => (1.0 - s, 1.0 - t),
            270 => (t, 1.0 - s),
            _ => (s, t),
        }
    };
    let (a, b) = (corner(r[0], r[1]), corner(r[2], r[3]));
    let (x0, x1) = (a.0.min(b.0), a.0.max(b.0));
    let (y0, y1) = (a.1.min(b.1), a.1.max(b.1));
    (x0, y0, x1 - x0, y1 - y0)
}

pub fn export(src: &Path, dest: &Path, annots: &[Annotation]) -> Result<usize, String> {
    if src.canonicalize().ok() == dest.canonicalize().ok() && dest.exists() {
        return Err("Choose a different file than the original".into());
    }
    let mut doc = Document::load(src).map_err(|e| format!("Could not read PDF: {e}"))?;
    let pages = doc.get_pages();
    let mut written = 0;
    for a in annots {
        let Some(&page_id) = pages.get(&a.page) else { continue };
        if a.rects.is_empty() {
            continue;
        }
        let (mb, rotate) = page_geometry(&doc, page_id)?;
        let annot_id = doc.add_object(annotation_dict(a, mb, rotate));
        let existing = doc
            .get_dictionary(page_id)
            .map_err(|e| e.to_string())?
            .get(b"Annots")
            .ok()
            .cloned();
        match existing {
            Some(Object::Reference(r)) => {
                if let Ok(Object::Array(arr)) = doc.get_object_mut(r) {
                    arr.push(Object::Reference(annot_id));
                }
            }
            Some(Object::Array(mut arr)) => {
                arr.push(Object::Reference(annot_id));
                doc.get_dictionary_mut(page_id)
                    .map_err(|e| e.to_string())?
                    .set("Annots", arr);
            }
            _ => {
                doc.get_dictionary_mut(page_id)
                    .map_err(|e| e.to_string())?
                    .set("Annots", vec![Object::Reference(annot_id)]);
            }
        }
        written += 1;
    }
    doc.save(dest).map_err(|e| format!("Could not write PDF: {e}"))?;
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::Stream;

    fn sample(path: &Path, rotate: i64) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let c = doc.add_object(Stream::new(dictionary! {}, b"".to_vec()));
        let page = doc.add_object(dictionary! {"Type"=>"Page","Parent"=>pages_id,"Contents"=>c, "Rotate"=>rotate});
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1,
            "MediaBox"=>vec![0.into(),0.into(),600.into(),800.into()]}),
        );
        let catalog = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages_id});
        doc.trailer.set("Root", catalog);
        doc.save(path).unwrap();
    }

    #[test]
    fn maps_rotations() {
        let mb = [0.0, 0.0, 600.0, 800.0];
        assert_eq!(to_pdf(0.0, 0.0, 0, mb), (0.0, 800.0));
        assert_eq!(to_pdf(1.0, 1.0, 0, mb), (600.0, 0.0));
        // displayed top-right corner of a 90° page is the page's top-left
        assert_eq!(to_pdf(1.0, 0.0, 90, mb), (0.0, 800.0));
        assert_eq!(to_pdf(0.0, 0.0, 180, mb), (600.0, 0.0));
        assert_eq!(to_pdf(0.0, 1.0, 270, mb), (0.0, 800.0));
    }

    #[test]
    fn writes_annotations_to_a_copy() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("in.pdf");
        sample(&src, 0);
        let before = std::fs::read(&src).unwrap();
        let out = dir.path().join("out.pdf");
        let a = Annotation {
            page: 1,
            kind: "highlight".into(),
            rects: vec![(0.1, 0.1, 0.5, 0.05)],
            rgb: color_rgb("yellow"),
            contents: Some("key point".into()),
        };
        let r = Annotation {
            kind: "rect".into(),
            ..a.clone()
        };
        let missing = Annotation { page: 9, ..a.clone() };
        assert_eq!(export(&src, &out, &[a, r, missing]).unwrap(), 2);
        assert_eq!(std::fs::read(&src).unwrap(), before, "original untouched");
        let doc = Document::load(&out).unwrap();
        let page = *doc.get_pages().get(&1).unwrap();
        let annots = doc
            .get_dictionary(page)
            .unwrap()
            .get(b"Annots")
            .unwrap()
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(annots.len(), 2);
        let first = doc.get_dictionary(annots[0].as_reference().unwrap()).unwrap();
        assert_eq!(first.get(b"Subtype").unwrap().as_name().unwrap(), b"Highlight");
        let rect: Vec<f32> = first
            .get(b"Rect")
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o.as_float().unwrap())
            .collect();
        assert_eq!(rect, vec![60.0, 680.0, 360.0, 720.0]);
        assert!(export(&src, &src, &[]).is_err());
    }
}
