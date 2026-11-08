const base = "http://localhost:3111";
const testAccounts = [];
let proofUrl;

const check = (condition, name) => {
  if (!condition) throw new Error(`Failed: ${name}`);
  console.log(`PASS ${name}`);
};

const cookie = (response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

async function readJson(response, name) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${name}: HTTP ${response.status}, invalid response`);
  }
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} ${body.error ?? ""}`);
  return body;
}

try {
  const sessionResponse = await fetch(`${base}/api/dashboard-test/session?role=customer`);
  const session = await readJson(sessionResponse, "create test customer");
  testAccounts.push(session);
  const customerHeaders = { cookie: cookie(sessionResponse) };
  check(Boolean(session.customerId && session.productId && customerHeaders.cookie),
    "customer test session and catalog fixture created");

  const otherSessionResponse = await fetch(`${base}/api/dashboard-test/session?role=customer`);
  const otherSession = await readJson(otherSessionResponse, "create second test customer");
  testAccounts.push(otherSession);
  const otherCustomerHeaders = { cookie: cookie(otherSessionResponse) };
  check(Boolean(otherSession.customerId && otherCustomerHeaders.cookie), "second customer session created for ownership checks");

  const products = await readJson(
    await fetch(`${base}/api/products`, { headers: customerHeaders }),
    "read products",
  );
  check(products.some((product) => product.id_produk === session.productId && product.deskripsi_produk),
    "catalog reads product and metadata from PostgreSQL");
  const expectedPrices = { PR01: "35000", PR02: "45000", PR03: "5000", PR04: "6000", PR05: "72000" };
  check(Object.entries(expectedPrices).every(([id, price]) =>
    products.some((product) => product.id_produk === id &&
      String(product.harga_produk) === price && product.stok_produk === null)),
  "approved prices are stored by product ID and unconfirmed stock remains unavailable");
  const unavailableCheckout = await fetch(`${base}/api/customer/orders`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: "PR01", quantity: 1 }],
      paymentMethod: "Tunai",
      handoverMethod: "Ambil di Tempat",
    }),
  });
  check(unavailableCheckout.status === 409, "checkout rejects products without confirmed stock");

  const created = await readJson(await fetch(`${base}/api/customer/orders`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: session.productId, quantity: 1 }],
      paymentMethod: "Transfer",
      handoverMethod: "Ambil di Tempat",
    }),
  }), "checkout");
  const orderNumber = created.no_pesanan;
  check(Boolean(orderNumber), "checkout created an order");

  let orders = await readJson(await fetch(`${base}/api/orders`, { headers: customerHeaders }), "read own orders");
  check(orders.some((order) => order.no_pesanan === orderNumber && order.id_pelanggan === session.customerId),
    "customer orders are scoped by customer ID");
  const details = await readJson(
    await fetch(`${base}/api/order-details`, { headers: customerHeaders }),
    "read order details",
  );
  check(details.some((detail) => detail.no_pesanan === orderNumber), "order details persisted and readable");
  const otherOrders = await readJson(
    await fetch(`${base}/api/orders`, { headers: otherCustomerHeaders }),
    "read second customer orders",
  );
  const otherDetails = await readJson(
    await fetch(`${base}/api/order-details`, { headers: otherCustomerHeaders }),
    "read second customer order details",
  );
  check(!otherOrders.some((order) => order.no_pesanan === orderNumber) &&
    !otherDetails.some((detail) => detail.no_pesanan === orderNumber),
  "other customer cannot read the order or its details");

  const payments = await readJson(await fetch(`${base}/api/payments`, { headers: customerHeaders }), "read payments");
  let payment = payments.find((item) => item.no_pesanan === orderNumber);
  check(payment?.status_pembayaran === "Menunggu", "checkout payment starts unpaid");

  const adminSessionResponse = await fetch(`${base}/api/dashboard-test/session?role=admin`);
  await readJson(adminSessionResponse, "create admin test session");
  const adminHeaders = { cookie: cookie(adminSessionResponse) };
  check(Boolean(adminHeaders.cookie), "admin test session created");
  const unavailableUsers = await fetch(`${base}/api/users`);
  check(unavailableUsers.status === 401, "user data requires an authenticated session");
  const updatedFixtureProduct = await readJson(await fetch(`${base}/api/products`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_produk: session.productId },
      values: { stok_produk: 2 },
    }),
  }), "admin updates a confirmed inventory count");
  check(updatedFixtureProduct.id_produk === session.productId, "admin stock updates are saved by product ID");
  const users = await readJson(await fetch(`${base}/api/users`, { headers: adminHeaders }), "read admin users");
  const admin = users.find((user) => String(user.peran).toLowerCase() === "admin");
  check(Boolean(admin), "admin is available to verify payments");
  const employeeSessionResponse = await fetch(`${base}/api/dashboard-test/session?role=employee`);
  const employeeSession = await readJson(employeeSessionResponse, "create employee test session");
  const employeeHeaders = { cookie: cookie(employeeSessionResponse) };
  check(Boolean(employeeSession.userId && employeeHeaders.cookie), "employee session created for assigned-work checks");
  const ownerSessionResponse = await fetch(`${base}/api/dashboard-test/session?role=owner`);
  await readJson(ownerSessionResponse, "create owner test session");
  const ownerHeaders = { cookie: cookie(ownerSessionResponse) };
  check(Boolean(ownerHeaders.cookie), "owner session created for report access checks");
  const ownerSummary = await readJson(
    await fetch(`${base}/api/operations/summary`, { headers: ownerHeaders }),
    "read owner business summary",
  );
  check(ownerSummary.customerCount >= 0, "owner summary exposes aggregate customer count");
  const ownerWrite = await fetch(`${base}/api/products`, {
    method: "PUT",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ keys: { id_produk: "PR01" }, values: { harga_produk: "35000" } }),
  });
  check(ownerWrite.status === 403, "owner monitoring access is read-only");
  const employeePayments = await fetch(`${base}/api/payments`, { headers: employeeHeaders });
  check(employeePayments.status === 403, "employee cannot access payment data");
  const employeeUsers = await fetch(`${base}/api/users`, { headers: employeeHeaders });
  check(employeeUsers.status === 403, "employee cannot access user administration");
  const ownerUsers = await fetch(`${base}/api/users`, { headers: ownerHeaders });
  check(ownerUsers.status === 403, "owner summary does not expose user account records");

  const proofBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/rN8AAAAASUVORK5CYII=",
    "base64",
  );
  const proofForm = new FormData();
  proofForm.set("orderNumber", orderNumber);
  proofForm.set("file", new Blob([proofBytes], { type: "image/png" }), "proof.png");
  const uploadedProof = await readJson(await fetch(`${base}/api/customer/payment-proofs`, {
    method: "POST",
    headers: customerHeaders,
    body: proofForm,
  }), "upload transfer proof");
  proofUrl = uploadedProof.proofUrl;
  check(typeof proofUrl === "string", "payment proof uploaded to private file storage");
  const privateProof = await fetch(`${base}${proofUrl}`, { headers: otherCustomerHeaders });
  check(privateProof.status === 404, "other customer cannot read an unowned payment proof");

  const submittedPayment = await readJson(await fetch(`${base}/api/customer/payments`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      orderNumber,
      paymentMethod: "Transfer",
      proofUrl,
    }),
  }), "submit transfer proof link");
  check(submittedPayment.payment.status_pembayaran === "Konfirmasi",
    "payment awaits verification and is not reported successful");
  check(submittedPayment.payment.no_pesanan === orderNumber &&
    submittedPayment.payment.jumlah_bayar === "1000",
  "payment amount matches persisted order detail prices");
  payment = submittedPayment.payment;
  const otherPayments = await readJson(
    await fetch(`${base}/api/payments`, { headers: otherCustomerHeaders }),
    "read second customer payments",
  );
  check(!otherPayments.some((item) => item.no_pesanan === orderNumber),
    "other customer cannot read the payment");
  const unauthorizedPayment = await fetch(`${base}/api/customer/payments`, {
    method: "POST",
    headers: { ...otherCustomerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ orderNumber, paymentMethod: "Tunai" }),
  });
  check(unauthorizedPayment.status === 404, "other customer cannot modify the payment");
  const proofResponse = await fetch(`${base}${proofUrl}`, { headers: customerHeaders });
  check(proofResponse.status === 200 && proofResponse.headers.get("content-type") === "image/png",
    "customer can reopen their uploaded proof");

  await readJson(await fetch(`${base}/api/payments`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_pembayaran: payment.id_pembayaran },
      values: { status_pembayaran: "Berhasil" },
    }),
  }), "admin verifies payment");
  orders = await readJson(await fetch(`${base}/api/orders`, { headers: customerHeaders }), "read verified order");
  let order = orders.find((item) => item.no_pesanan === orderNumber);
  check(order?.status_pesanan === "Diproses", "verified payment advances order to processing");

  const date = new Date().toISOString().slice(0, 10);
  const productionId = `ZT${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await readJson(await fetch(`${base}/api/production`, {
    method: "POST",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      values: {
        id_produksi: productionId,
        no_pesanan: orderNumber,
        id_karyawan: employeeSession.userId,
        status_produksi: "Menunggu",
        tanggal_mulai_produksi: date,
      },
    }),
  }), "create production record");
  const duplicateProduction = await fetch(`${base}/api/production`, {
    method: "POST",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      values: {
        id_produksi: `ZT${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        no_pesanan: orderNumber,
        id_karyawan: employeeSession.userId,
        status_produksi: "Menunggu",
        tanggal_mulai_produksi: date,
      },
    }),
  });
  check(duplicateProduction.status === 409, "a paid order cannot be assigned to production twice");
  const unreadyHandover = await fetch(`${base}/api/handover`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_penyerahan: (await readJson(
        await fetch(`${base}/api/handover`, { headers: customerHeaders }),
        "read pending handover",
      )).find((item) => item.no_pesanan === orderNumber).id_penyerahan },
      values: { status_penyerahan: "Diserahkan" },
    }),
  });
  check(unreadyHandover.status === 409, "an order cannot be handed over before production is complete");
  const employeeJobs = await readJson(
    await fetch(`${base}/api/production`, { headers: employeeHeaders }),
    "read assigned employee jobs",
  );
  check(employeeJobs.some((job) => job.id_produksi === productionId) &&
    employeeJobs.every((job) => job.id_karyawan === employeeSession.userId),
  "employee production queue is restricted to assigned jobs");
  const adminCompletion = await fetch(`${base}/api/production`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_produksi: productionId },
      values: { status_produksi: "Selesai", tanggal_selesai_produksi: date },
    }),
  });
  check(adminCompletion.status === 403, "admin cannot impersonate employee production completion");
  await readJson(await fetch(`${base}/api/production`, {
    method: "PUT",
    headers: { ...employeeHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_produksi: productionId },
      values: { status_produksi: "Diproses", tanggal_mulai_produksi: date },
    }),
  }), "start production");
  await readJson(await fetch(`${base}/api/production`, {
    method: "PUT",
    headers: { ...employeeHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_produksi: productionId },
      values: { status_produksi: "Selesai", tanggal_selesai_produksi: date },
    }),
  }), "complete production");
  const roleChange = await fetch(`${base}/api/users`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_pengguna: admin.id_pengguna },
      values: { peran: "Admin" },
    }),
  });
  check(roleChange.status === 403, "admin cannot change user privileges");
  orders = await readJson(await fetch(`${base}/api/orders`, { headers: customerHeaders }), "read completed order");
  order = orders.find((item) => item.no_pesanan === orderNumber);
  check(order?.status_pesanan === "Selesai", "production completion advances order");

  const handovers = await readJson(
    await fetch(`${base}/api/handover`, { headers: customerHeaders }),
    "read handover",
  );
  const handover = handovers.find((item) => item.no_pesanan === orderNumber);
  check(Boolean(handover), "handover record persisted");
  await readJson(await fetch(`${base}/api/handover`, {
    method: "PUT",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      keys: { id_penyerahan: handover.id_penyerahan },
      values: { status_penyerahan: "Diserahkan" },
    }),
  }), "mark order handed over");
  orders = await readJson(await fetch(`${base}/api/orders`, { headers: customerHeaders }), "read handed-over order");
  order = orders.find((item) => item.no_pesanan === orderNumber);
  check(order?.status_pesanan === "Diserahkan", "handover advances order");

  const unauthorizedReview = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { ...otherCustomerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      values: { no_pesanan: orderNumber, rating: 5, isi_ulasan: "Ulasan pelanggan lain." },
    }),
  });
  check(unauthorizedReview.status === 409, "other customer cannot review the order");

  const review = await readJson(await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      values: { no_pesanan: orderNumber, rating: 5, isi_ulasan: "Uji alur pelanggan." },
    }),
  }), "submit review");
  check(review.no_pesanan === orderNumber, "review persisted after handover");
  const duplicate = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { ...customerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      values: { no_pesanan: orderNumber, rating: 4, isi_ulasan: "Ulasan duplikat." },
    }),
  });
  check(duplicate.status === 409, "second review for the order rejected");
  const reviews = await readJson(
    await fetch(`${base}/api/reviews`, { headers: customerHeaders }),
    "read own reviews",
  );
  check(reviews.some((item) => item.no_pesanan === orderNumber), "review history is scoped and readable");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Customer flow test failed.");
  process.exitCode = 1;
} finally {
  for (const account of testAccounts) {
    const cleanup = await fetch(`${base}/api/dashboard-test/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: account.customerId,
        productId: account.productId,
        proofUrl: account === testAccounts[0] ? proofUrl : undefined,
      }),
    });
    const result = await cleanup.json();
    console.log(cleanup.ok && result.cleaned
      ? "PASS temporary test records and product fixture removed"
      : `CLEANUP REQUIRED: HTTP ${cleanup.status}`);
    if (!cleanup.ok) process.exitCode = 1;
  }
}
