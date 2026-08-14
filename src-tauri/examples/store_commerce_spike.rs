//! Disposable Microsoft Store license and durable-add-on diagnostic.
//!
//! Run from an installed Store-associated MSIX for authoritative results:
//! `cargo run --example store_commerce_spike`

#[cfg(not(windows))]
fn main() {
    eprintln!("store_commerce_spike is Windows-only");
    std::process::exit(1);
}

#[cfg(windows)]
mod windows_spike {
    use serde::Serialize;
    use windows::core::{Error, HRESULT, HSTRING};
    use windows::ApplicationModel::Package;
    use windows::Services::Store::StoreContext;
    use windows_collections::IIterable;

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DiagnosticReport {
        status: &'static str,
        package: PackageDiagnostic,
        app_license: AppLicenseDiagnostic,
        durable_products: StageDiagnostic,
        add_on_licenses: Vec<AddOnLicenseDiagnostic>,
        products: Vec<ProductDiagnostic>,
    }

    #[derive(Debug, Default, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PackageDiagnostic {
        available: bool,
        name: Option<String>,
        family_name: Option<String>,
        error: Option<ErrorDiagnostic>,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StageDiagnostic {
        succeeded: bool,
        error: Option<ErrorDiagnostic>,
    }

    impl StageDiagnostic {
        fn succeeded() -> Self {
            Self {
                succeeded: true,
                error: None,
            }
        }

        fn failed(error: ErrorDiagnostic) -> Self {
            Self {
                succeeded: false,
                error: Some(error),
            }
        }

        fn blocked(reason: &str) -> Self {
            Self::failed(ErrorDiagnostic {
                code: None,
                message: reason.to_owned(),
            })
        }
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AppLicenseDiagnostic {
        succeeded: bool,
        active: Option<bool>,
        trial: Option<bool>,
        sku_store_id: Option<String>,
        error: Option<ErrorDiagnostic>,
    }

    impl AppLicenseDiagnostic {
        fn failed(error: ErrorDiagnostic) -> Self {
            Self {
                succeeded: false,
                active: None,
                trial: None,
                sku_store_id: None,
                error: Some(error),
            }
        }
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ErrorDiagnostic {
        code: Option<String>,
        message: String,
    }

    impl From<Error> for ErrorDiagnostic {
        fn from(error: Error) -> Self {
            Self {
                code: Some(format_hresult(error.code())),
                message: error.message(),
            }
        }
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AddOnLicenseDiagnostic {
        store_id: String,
        in_app_offer_token: String,
        active: bool,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ProductDiagnostic {
        store_id: String,
        in_app_offer_token: String,
        title: String,
        formatted_price: String,
        in_user_collection: bool,
    }

    pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
        let package = inspect_package();

        let context = match StoreContext::GetDefault() {
            Ok(context) => context,
            Err(error) => {
                print_report(DiagnosticReport {
                    status: "blocked",
                    package,
                    app_license: AppLicenseDiagnostic::failed(error.into()),
                    durable_products: StageDiagnostic::blocked(
                        "StoreContext is unavailable; durable products were not queried",
                    ),
                    add_on_licenses: Vec::new(),
                    products: Vec::new(),
                })?;
                return Ok(());
            }
        };

        let (app_license, add_on_licenses) = match context.GetAppLicenseAsync() {
            Ok(operation) => match operation.await {
                Ok(license) => {
                    let licenses = license.AddOnLicenses()?;
                    let mut results = Vec::with_capacity(licenses.Size()? as usize);
                    for entry in &licenses {
                        let license = entry.Value()?;
                        results.push(AddOnLicenseDiagnostic {
                            store_id: entry.Key()?.to_string_lossy(),
                            in_app_offer_token: license.InAppOfferToken()?.to_string_lossy(),
                            active: license.IsActive()?,
                        });
                    }
                    (
                        AppLicenseDiagnostic {
                            succeeded: true,
                            active: Some(license.IsActive()?),
                            trial: Some(license.IsTrial()?),
                            sku_store_id: Some(license.SkuStoreId()?.to_string_lossy()),
                            error: None,
                        },
                        results,
                    )
                }
                Err(error) => (AppLicenseDiagnostic::failed(error.into()), Vec::new()),
            },
            Err(error) => (AppLicenseDiagnostic::failed(error.into()), Vec::new()),
        };

        let durable_kinds: IIterable<HSTRING> = vec![HSTRING::from("Durable")].into();
        let (durable_products, products) = match context
            .GetAssociatedStoreProductsAsync(&durable_kinds)
        {
            Ok(operation) => match operation.await {
                Ok(result) => {
                    let extended_error = result.ExtendedError()?;
                    if extended_error.is_err() {
                        (
                            StageDiagnostic::failed(ErrorDiagnostic {
                                code: Some(format_hresult(extended_error)),
                                message: "Store returned an extended product-query error"
                                    .to_owned(),
                            }),
                            Vec::new(),
                        )
                    } else {
                        let products = result.Products()?;
                        let mut diagnostics = Vec::with_capacity(products.Size()? as usize);
                        for entry in &products {
                            let product = entry.Value()?;
                            diagnostics.push(ProductDiagnostic {
                                store_id: product.StoreId()?.to_string_lossy(),
                                in_app_offer_token: product.InAppOfferToken()?.to_string_lossy(),
                                title: product.Title()?.to_string_lossy(),
                                formatted_price: product
                                    .Price()?
                                    .FormattedPrice()?
                                    .to_string_lossy(),
                                in_user_collection: product.IsInUserCollection()?,
                            });
                        }
                        (StageDiagnostic::succeeded(), diagnostics)
                    }
                }
                Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
            },
            Err(error) => (StageDiagnostic::failed(error.into()), Vec::new()),
        };

        let status = if package.available && app_license.succeeded && durable_products.succeeded {
            "ready"
        } else {
            "blocked"
        };

        print_report(DiagnosticReport {
            status,
            package,
            app_license,
            durable_products,
            add_on_licenses,
            products,
        })?;
        Ok(())
    }

    fn inspect_package() -> PackageDiagnostic {
        let result = (|| {
            let package = Package::Current()?;
            let id = package.Id()?;
            Ok::<_, Error>((
                id.Name()?.to_string_lossy(),
                id.FamilyName()?.to_string_lossy(),
            ))
        })();

        match result {
            Ok((name, family_name)) => PackageDiagnostic {
                available: true,
                name: Some(name),
                family_name: Some(family_name),
                error: None,
            },
            Err(error) => PackageDiagnostic {
                available: false,
                name: None,
                family_name: None,
                error: Some(error.into()),
            },
        }
    }

    fn format_hresult(code: HRESULT) -> String {
        format!("0x{:08X}", code.0 as u32)
    }

    fn print_report(report: DiagnosticReport) -> Result<(), serde_json::Error> {
        println!("{}", serde_json::to_string_pretty(&report)?);
        Ok(())
    }
}

#[cfg(windows)]
#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = windows_spike::run().await {
        eprintln!("store commerce spike failed: {error}");
        std::process::exit(1);
    }
}
